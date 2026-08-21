import { NextResponse } from "next/server";
import { portalActionBodySchema } from "@brazil-tms/shared";
import { enfileirarOrdemDoPortal, OrdemRecusada } from "@brazil-tms/db";
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
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");
    const { id } = await params;
    const body = portalActionBodySchema.parse(await request.json());

    const item = await enfileirarOrdemDoPortal({
      tripId: id,
      action: body.action,
      reasonId: body.reasonId ?? null,
      remark: body.remark ?? null,
      driverId: body.driverId ?? null,
      secondDriverId: body.secondDriverId ?? null,
      plates: body.plates ?? [],
      requestedBy: ctx.userId,
    });

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
  }
}
