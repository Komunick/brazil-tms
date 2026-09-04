import { NextResponse } from "next/server";
import { portalActionBodySchema } from "@brazil-tms/shared";
import {
  enfileirarOrdemDoPortal,
  gravarVinculosDaAtribuicao,
  ordensDaViagem,
  OrdemRecusada,
} from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { Conflict, NotFound, handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * POST /api/trips/:id/portal-action — aceitar ou rejeitar a viagem NO PORTAL, a partir do TMS.
 *
 * A rota NÃO fala com o portal. Quem tem sessão lá é o navegador da VM; daqui sairia um POST sem
 * credencial. Ela grava uma ordem, e o robô — que já vive dentro daquela sessão — executa e devolve
 * o resultado. Ver `schema/portal-commands.ts`.
 *
 * Permissão `assign_resources`, a mesma de pôr motorista em viagem: quem decide se a empresa faz a
 * viagem é quem decide quem a faz. Chave nova para isso seria uma pergunta a mais para o mesmo dono.
 *
 * 202 `{ item }` — ACEITO, não FEITO: o efeito no portal ainda não aconteceu quando esta resposta
 * sai, e um 200 diria que aconteceu. A tela mostra "enviando" até o robô voltar.
 * 409: NOT_PENDING / NO_PORTAL_ID / COMMAND_IN_FLIGHT / INVALID_REASON. 404 viagem inexistente.
 */
/**
 * GET /api/trips/:id/portal-action — em que pé está a última ordem desta viagem.
 *
 * O POST devolve 202: ACEITO, não FEITO. Entre apertar o botão e o portal responder passam alguns
 * segundos, e até hoje a tela não contava nada nesse intervalo — o usuário apertou, não viu nada
 * acontecer, foi conferir no portal e voltou achando que não tinha funcionado. Tinha.
 *
 * Esta rota existe para a tela poder dizer a verdade em cada momento: enfileirada, o robô pegou,
 * o portal confirmou, o portal recusou (e por quê). É leitura pura sobre uma tabela indexada por
 * viagem; a tela só pergunta enquanto há ordem em voo, e para sozinha quando ela fecha.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");
    const { id } = await params;
    return NextResponse.json({ items: await ordensDaViagem(id, 3) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");
    const { id } = await params;
    const body = portalActionBodySchema.parse(await request.json());

    /**
     * DECIDIR PELO CARTÃO DE SPOT EXIGE UMA CHAVE A MAIS (2026-09-01, fatia 030).
     *
     * Não é um segundo caminho de autorização — é UMA condição adicional sobre o caminho que já
     * existe. A rota continua sendo esta, com o mesmo `requirePermission` acima, o mesmo guarda de
     * cabimento e a mesma auditoria. O que muda é que decidir um LEILÃO é outro ato: quem aceita
     * pelo cartão está tomando a oferta para a empresa em segundos, sem a lista à vista.
     *
     * São 18 despachantes com `assign_resources` hoje. Sem esta linha, o botão ficaria escondido
     * para eles na tela e a rota continuaria aberta — e botão escondido nunca foi garantia.
     */
    if (body.origem === "oferta_spot") requirePermission(ctx, "decidir_spot");

    const item = await enfileirarOrdemDoPortal({
      tripId: id,
      action: body.action,
      reasonId: body.reasonId ?? null,
      remark: body.remark ?? null,
      driverId: body.driverId ?? null,
      secondDriverId: body.secondDriverId ?? null,
      plates: body.plates ?? [],
      requestedBy: ctx.userId,
      // Só a auditoria a recebe; o portal não tem este campo. Ver `portal-commands.ts`.
      origem: body.origem ?? null,
      // Exigido só na TROCA, e quem recusa é o banco — ver o guarda em portal-commands.
      motivoDaTroca: body.motivoDaTroca ?? null,
    });

    /**
     * O VÍNCULO VAI PARA O NOSSO CADASTRO, e DEPOIS de a ordem estar enfileirada (2026-08-25, 026).
     *
     * A ordem do portal é o que a pessoa pediu; o vínculo é um efeito colateral útil que a
     * gerenciadora Logae vai exigir mais adiante. Se ele viesse antes e falhasse, a atribuição —
     * que é o pedido de verdade — não aconteceria por causa de um dado acessório.
     *
     * `await` mesmo assim, e não disparar-e-esquecer: a função inteira já engole os próprios erros
     * (ver `pre-sm-vinculos.ts`), e esperar por ela deixa a resposta refletir o que de fato ficou
     * gravado. São dois `update` por índice, no mesmo banco — não é o que torna esta rota lenta.
     */
    if (body.action === "assign") {
      await gravarVinculosDaAtribuicao({
        placas: body.plates ?? [],
        vinculos: body.vinculos,
        portalDriverIds: [body.driverId, body.secondDriverId],
      });
    }

    return NextResponse.json({ item }, { status: 202 });
  } catch (error) {
    return handleRouteError(traduzir(error));
  }
}

/** De regra violada para o vocabulário HTTP, com mensagem que a tela pode mostrar sem reescrever. */
function traduzir(error: unknown): unknown {
  if (!(error instanceof OrdemRecusada)) return error;
  switch (error.motivo) {
    case "viagem_inexistente":
      return new NotFound("NOT_FOUND", "Viagem não encontrada.");
    case "motorista_bloqueado":
      // O nome e o motivo vêm no `detalhe`: numa atribuição com dois motoristas, "um deles está
      // bloqueado" faria a pessoa adivinhar qual — e a adivinhação erra metade das vezes.
      return new Conflict(
        "DRIVER_BLOCKED",
        `Motorista bloqueado: ${error.detalhe ?? ""}. Desbloqueie no cadastro para poder escalá-lo.`,
      );
    case "nao_esta_pendente":
      return new Conflict(
        "NOT_PENDING",
        "Esta viagem não está esperando decisão no portal — ou já foi aceita, ou nunca passou por lá.",
      );
    case "sem_id_do_portal":
      return new Conflict(
        "NO_PORTAL_ID",
        "Esta viagem não veio do portal, então não há o que aceitar lá.",
      );
    case "ordem_em_andamento":
      return new Conflict(
        "COMMAND_IN_FLIGHT",
        "Já existe uma decisão sendo enviada para esta viagem. Aguarde o resultado.",
      );
    case "motivo_invalido":
      return new Conflict("INVALID_REASON", "Escolha um dos motivos que o portal aceita.");
    case "motivo_da_troca_obrigatorio":
      return new Conflict(
        "REASSIGN_REASON_REQUIRED",
        "Esta viagem já tem motorista. Diga por que está trocando — o motivo fica na linha do tempo.",
      );
    case "sem_motorista":
      return new Conflict("NO_DRIVER", "Escolha o motorista.");
    case "sem_placa":
      return new Conflict("NO_PLATE", "Informe a placa do veículo.");
    case "placa_invalida":
      return new Conflict("INVALID_PLATE", "Placa inválida. Use o formato ABC1234 ou ABC1D23.");
    case "placas_repetidas":
      return new Conflict("DUPLICATE_PLATE", "As duas placas são iguais.");
    case "motoristas_repetidos":
      return new Conflict("DUPLICATE_DRIVER", "O segundo motorista é o mesmo do primeiro.");
    case "nao_aceita":
      return new Conflict(
        "NOT_ACCEPTED",
        "Só dá para atribuir depois que a viagem for aceita no portal.",
      );
  }
}
