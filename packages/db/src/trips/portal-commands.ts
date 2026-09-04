import { and, asc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import {
  confirmarAcaoNoPortal,
  ehTrocaDeAtribuicao,
  impedimentoDaAcao,
  impedimentoDaAtribuicao,
  impedimentoParaAtribuir,
  motivoDaTrocaServe,
  motivoValido,
  normalizarPlaca,
  placasEsperadas,
  type ImpedimentoDaAcao,
  type ImpedimentoDaAtribuicao,
  type ImpedimentoParaAtribuir,
  type PortalAction,
  type Veredito,
} from "@brazil-tms/shared";
import { db } from "../client";
import { drivers, portalCommands, tripEvents, trips } from "../../schema";
import { writeAudit } from "../audit/write-audit";

/**
 * A FILA DE ORDENS PARA O PORTAL (2026-08-21).
 *
 * Ver `schema/portal-commands.ts` para o porquê de uma ordem gravada em vez de um POST direto. Aqui
 * ficam as três operações do ciclo de vida — nascer, ser pega, terminar — e a única regra que não
 * pode falhar: nunca duas ordens em voo para a mesma viagem.
 */

export interface OrdemDoPortal {
  id: string;
  tripId: string;
  externalTripId: string | null;
  portalTripId: string;
  action: PortalAction;
  reasonId: number | null;
  remark: string | null;
  /** Atribuição: o id do motorista NO PORTAL, o segundo (se houver) e as placas. */
  driverId: number | null;
  secondDriverId: number | null;
  plates: string[];
  /**
   * As placas que NÃO foram ao portal e ficaram como controle interno (2026-08-28).
   *
   * Vazio na imensa maioria das ordens. Só tem valor quando alguém acrescentou uma placa a mais
   * do que o tipo da LH comporta — a carreta que segue junto de um truck, tipicamente.
   */
  platesInternas: string[];
  status: "pending" | "sent" | "done" | "failed";
  attempts: number;
  lastError: string | null;
  requestedAt: string;
  settledAt: string | null;
}

/** Erro de REGRA, não de sistema: a rota traduz cada um para uma mensagem que a tela mostra. */
export class OrdemRecusada extends Error {
  constructor(
    readonly motivo:
      | ImpedimentoDaAcao
      | ImpedimentoDaAtribuicao
      | ImpedimentoParaAtribuir
      | "viagem_inexistente"
      | "motorista_bloqueado"
      | "motivo_invalido",
    /**
     * O complemento que a mensagem precisa — hoje, QUEM está bloqueado.
     *
     * Numa atribuição com dois motoristas, "um deles está bloqueado" faria a pessoa adivinhar
     * qual, e a adivinhação erraria metade das vezes.
     */
    readonly detalhe?: string,
  ) {
    super(motivo);
    this.name = "OrdemRecusada";
  }
}

const ABERTAS = ["pending", "sent"] as const;

/** Cada ordem tem a sua linha na auditoria: é onde se responde "quem decidiu isso, e quando?". */
const ACAO_AUDITADA = {
  accept: "trip.portal_accept",
  reject: "trip.portal_reject",
  assign: "trip.portal_assign",
} as const;

/**
 * O SEGUNDO REGISTRO: o que o PORTAL respondeu (2026-08-28, a pedido).
 *
 * O de cima grava a DECISÃO — quem apertou, quando, com que placas. Ele é escrito na mesma
 * transação do clique, antes de o robô sair, e por construção não sabe nada sobre o desfecho.
 *
 * Isto aqui é o par dele. Nasce quando o portal responde, e carrega a palavra DELE: o `retcode`
 * como veio, a mensagem como veio, quanto tempo levou e qual tentativa foi.
 *
 * ── POR QUE DOIS REGISTROS, E NÃO UM ATUALIZADO ────────────────────────────────────────────────
 *
 * Porque são fatos de momentos e autores diferentes, e a auditoria existe para preservar ordem.
 * Reescrever a linha da decisão com o desfecho apagaria a hora em que a pessoa decidiu — que é
 * justamente o que se quer provar quando alguém pergunta "quem mandou isso, e o portal aceitou?".
 *
 * Em 28/08 a operação passou uma tarde achando que aceites não chegavam ao portal. A resposta
 * estava em `portal_commands.response` o tempo inteiro, e só apareceu porque alguém foi ao banco
 * com SQL. É esse caminho que este registro encurta.
 */
const ACAO_DO_DESFECHO = {
  accept: "trip.portal_accept_result",
  reject: "trip.portal_reject_result",
  assign: "trip.portal_assign_result",
} as const;

/**
 * Grava a ordem, recusando tudo que o portal recusaria mais tarde.
 *
 * TUDO NUMA TRANSAÇÃO, com a viagem travada (`FOR UPDATE`): a checagem de "já tem ordem aberta?" e a
 * gravação precisam ser o mesmo instante. Dois cliques simultâneos passariam os dois pela checagem e
 * gravariam os dois — e "aceitar duas vezes" não se desfaz do nosso lado. O índice parcial no banco
 * é a segunda linha de defesa, para o caso de dois processos; esta é a primeira.
 *
 * As validações de negócio moram em `impedimentoDaAcao` (shared, sob teste) e são feitas com o dado
 * LIDO DENTRO da transação, não com o que a tela mandou. A tela decide o que desenhar; ela não
 * decide o que é verdade.
 */
export async function enfileirarOrdemDoPortal(entrada: {
  tripId: string;
  action: PortalAction;
  reasonId?: number | null;
  remark?: string | null;
  /** Só para `assign`. As regras vivem em `domain/portal-assignment.ts`. */
  driverId?: number | null;
  secondDriverId?: number | null;
  plates?: string[];
  requestedBy: string;
  /**
   * DE ONDE A DECISÃO SAIU (2026-09-01, fatia 030).
   *
   * Opcional, e ausente significa `tela_da_viagem` — que era o único lugar de onde se decidia até o
   * cartão de spot ganhar o botão. Ela vai para a AUDITORIA, e não para o portal: o portal não tem
   * este campo e não saberia o que fazer com ele.
   *
   * Serve para a revisão depois distinguir a decisão tomada no calor do leilão, em segundos, da
   * tomada na tela da viagem com a lista inteira à vista. São dois atos diferentes, e até aqui o
   * registro não os separava.
   */
  origem?: "oferta_spot" | "tela_da_viagem" | null;
  /**
   * POR QUE ESTÁ TROCANDO quem já estava escalado (2026-09-04, a pedido).
   *
   * Exigido só quando a viagem JÁ tem motorista no portal e o novo é OUTRO. Ver o guarda dentro da
   * transação — é lá que a regra vale, e não na tela.
   */
  motivoDaTroca?: string | null;
}): Promise<OrdemDoPortal> {
  if (entrada.action === "assign") {
    // As regras vivem em `shared`, sob teste. Aqui só se recusa o que elas apontarem, com o mesmo
    // vocabulário que a rota traduz para a tela.
    const impedimento = impedimentoDaAtribuicao({
      driverId: entrada.driverId ?? 0,
      secondDriverId: entrada.secondDriverId ?? null,
      plates: entrada.plates ?? [],
    });
    if (impedimento) throw new OrdemRecusada(impedimento);
  }
  if (entrada.action === "reject" && !motivoValido(entrada.reasonId)) {
    // O portal não deixa rejeitar sem motivo — o botão dele abre um diálogo antes de qualquer
    // chamada. Recusar aqui poupa uma ida à VM para receber a mesma recusa em outra língua.
    throw new OrdemRecusada("motivo_invalido");
  }

  return db.transaction(async (tx) => {
    const viagem = await tx
      .select({
        id: trips.id,
        externalTripId: trips.externalTripId,
        customerFields: trips.customerFields,
        // Decide QUANTAS placas o portal aceita nesta viagem. Ver a separação mais abaixo.
        plannedVehicleType: trips.plannedVehicleType,
      })
      .from(trips)
      .where(eq(trips.id, entrada.tripId))
      .for("update")
      .limit(1);
    const v = viagem[0];
    if (!v) throw new OrdemRecusada("viagem_inexistente");

    /**
     * MOTORISTA BLOQUEADO NÃO ENTRA EM VIAGEM (2026-08-25, a pedido).
     *
     * Aqui, e não na rota, por dois motivos. Está DENTRO da transação que trava a viagem, então
     * não cabe um bloqueio acontecendo entre a checagem e a gravação. E é o ponto por onde toda
     * atribuição passa — a tela já esconde o bloqueado, mas a tela não é garantia de nada: quem
     * mantiveste a página aberta desde antes do bloqueio ainda tem o nome na lista.
     *
     * A checagem é por id do PORTAL, que é o que o diálogo manda. Quem não existe no nosso
     * cadastro não pode estar bloqueado, e passa.
     */
    if (entrada.action === "assign") {
      const ids = [entrada.driverId, entrada.secondDriverId]
        .filter((d): d is number => d != null && Number.isFinite(d))
        .map((d) => String(d));
      if (ids.length > 0) {
        const bloqueados = await tx
          .select({ name: drivers.name, motivo: drivers.blockedReason })
          .from(drivers)
          .where(
            and(
              isNotNull(drivers.blockedAt),
              // `inArray`, e NÃO o template `sql`: o drizzle passa o array como UM parâmetro, não
              // como lista — a comparação nunca casaria, e a trava deixaria passar todo mundo sem
              // erro nenhum aparecer.
              inArray(drivers.portalDriverId, ids),
            ),
          );
        const b = bloqueados[0];
        if (b) {
          throw new OrdemRecusada(
            "motorista_bloqueado",
            b.motivo ? `${b.name} — ${b.motivo}` : b.name,
          );
        }
      }
    }

    /**
     * A PRIMEIRA PLACA VAI AO PORTAL; O QUE SOBRAR FICA NO TMS (2026-08-28, a pedido).
     *
     * O portal conta as placas contra o tipo da LH e recusa quando não fecha — medido: truck com
     * duas placas falhou 6 vezes em 30 dias, carreta com uma falhou 1, e as combinações certas
     * (carreta+2, truck+1, toco+1, 3/4+1) concluíram 141. Sete das nove falhas do período são isso.
     *
     * A resposta NÃO é bloquear: a operação precisa registrar a carreta que seguiu junto de um
     * truck. Foi a primeira correção que tentei e ela estava errada — teria tirado uma coisa
     * legítima para evitar um erro do fornecedor.
     *
     * `placasEsperadas` devolve 1 quando o tipo é nulo, e aqui isso seria destrutivo: mandaria só
     * uma placa numa carreta cuja viagem veio sem o campo, e o portal recusaria pelo motivo oposto.
     * Por isso, SEM TIPO CONHECIDO, nada é separado — vai tudo, como ia antes.
     */
    const todas = (entrada.plates ?? []).map(normalizarPlaca).filter(Boolean);
    const cabem = v.plannedVehicleType ? placasEsperadas(v.plannedVehicleType) : todas.length;
    const paraOPortal = todas.slice(0, cabem);
    const internas = todas.slice(cabem);

    const campos = (v.customerFields ?? {}) as Record<string, string>;
    const abertas = await tx
      .select({ id: portalCommands.id })
      .from(portalCommands)
      .where(
        and(
          eq(portalCommands.tripId, entrada.tripId),
          inArray(portalCommands.status, [...ABERTAS]),
        ),
      )
      .limit(1);

    /**
     * CADA AÇÃO TEM O SEU GUARDA, e isso não é simetria de estilo.
     *
     * Aceitar e recusar exigem `Pending`; atribuir exige `Accepted` — o MESMO campo, valores
     * opostos. Eu aplicava o guarda do aceite a todas as ações, e a atribuição teria sido recusada
     * sempre, com uma mensagem que fala de decisão para quem estava escalando motorista.
     */
    const alvo = {
      acceptanceStatus: campos["Aceitação (portal)"],
      portalTripId: campos["ID (portal)"],
      temOrdemAberta: abertas.length > 0,
    };
    const impedimento =
      entrada.action === "assign" ? impedimentoParaAtribuir(alvo) : impedimentoDaAcao(alvo);
    if (impedimento) throw new OrdemRecusada(impedimento);

    /**
     * TROCAR QUEM JÁ ESTAVA ESCALADO EXIGE MOTIVO (2026-09-04, a pedido).
     *
     * ── POR QUE AQUI, E NÃO NA TELA ───────────────────────────────────────────────────────────
     *
     * A tela pede o motivo antes — é o certo, e é o que faz o gesto ser bom. Mas tela não é
     * garantia: quem tem a página aberta desde antes desta regra continuaria mandando sem nada, e a
     * troca entraria sem registro. Aqui é dentro da transação que TRAVA a viagem, e é o ponto por
     * onde toda atribuição passa.
     *
     * ── O QUE CONTA COMO TROCA ────────────────────────────────────────────────────────────────
     *
     * O portal já tem um motorista nesta viagem, e o que está sendo mandado é OUTRO. Duas exclusões
     * deliberadas:
     *
     *   · a PRIMEIRA atribuição não pede nada — é o trabalho normal, são centenas por dia, e um
     *     campo obrigatório que atrapalha vira "asdf" digitado por reflexo;
     *   · reenviar o MESMO motorista não é troca. Acontece ao corrigir placa, ou ao repetir uma
     *     ordem que falhou no portal — exigir motivo ali puniria quem está consertando.
     */
    const ehTroca =
      entrada.action === "assign" &&
      ehTrocaDeAtribuicao({
        motoristaAtual: campos["ID do motorista (portal)"] as string | undefined,
        motoristaNovo: entrada.driverId,
      });
    const motivo = entrada.motivoDaTroca?.trim() || null;
    if (ehTroca && !motivoDaTrocaServe(motivo)) {
      throw new OrdemRecusada("motivo_da_troca_obrigatorio");
    }

    const linha = await tx
      .insert(portalCommands)
      .values({
        tripId: entrada.tripId,
        portalTripId: campos["ID (portal)"]!,
        externalTripId: v.externalTripId,
        action: entrada.action,
        reasonId: entrada.action === "reject" ? (entrada.reasonId ?? null) : null,
        remark: entrada.action === "reject" ? entrada.remark?.trim() || null : null,
        driverId: entrada.action === "assign" ? (entrada.driverId ?? null) : null,
        secondDriverId: entrada.action === "assign" ? (entrada.secondDriverId ?? null) : null,
        plates: entrada.action === "assign" ? paraOPortal.join(",") || null : null,
        platesInternas: entrada.action === "assign" ? internas.join(",") || null : null,
        requestedBy: entrada.requestedBy,
      })
      .returning();

    /**
     * A AUDITORIA NASCE JUNTO, na mesma transação.
     *
     * É o ponto deste recurso, não um enfeite: apertar no portal não deixa rastro nenhum do nosso
     * lado — ninguém sabe quem aceitou uma viagem, quando, nem por que recusou. Ela registra a
     * DECISÃO, que é o ato de gente; se o robô consegue executar é outro assunto, e mora no
     * estado da ordem.
     */
    await writeAudit(tx, {
      actorUserId: entrada.requestedBy,
      action: ACAO_AUDITADA[entrada.action],
      entityType: "trip",
      entityId: entrada.tripId,
      previousValue: null,
      newValue: {
        commandId: linha[0]!.id,
        portalTripId: linha[0]!.portalTripId,
        reasonId: linha[0]!.reasonId,
        remark: linha[0]!.remark,
        driverId: linha[0]!.driverId,
        secondDriverId: linha[0]!.secondDriverId,
        plates: linha[0]!.plates,
        // A auditoria registra as DUAS: o que foi ao portal e o que ficou por controle interno.
        platesInternas: linha[0]!.platesInternas,
        // De onde a pessoa decidiu — ver o comentário do campo na entrada. Só a auditoria a recebe.
        origem: entrada.origem ?? "tela_da_viagem",
        // O motivo da troca entra na auditoria TAMBÉM: a linha do tempo é para quem lê a viagem, a
        // auditoria é para quem revisa depois, e as duas precisam contar a mesma história.
        motivoDaTroca: ehTroca ? motivo : null,
      },
    });

    /**
     * O MOTIVO DA TROCA VAI PARA A LINHA DO TEMPO (2026-09-04, a pedido).
     *
     * ── POR QUE NA LINHA DO TEMPO, E NÃO SÓ NA AUDITORIA ──────────────────────────────────────
     *
     * A auditoria existe e já registraria isto. Mas ela é a tela de quem REVISA depois, com filtro e
     * data; a pergunta "por que trocaram o motorista desta LH?" é feita por quem está OLHANDO A
     * VIAGEM, no meio do dia. Um registro que só vive na auditoria é um registro que a operação não
     * lê.
     *
     * ── `note`, e não um tipo de evento novo ──────────────────────────────────────────────────
     *
     * O vocabulário de eventos é fechado de propósito, e o próprio schema avisa que `note` é a
     * ÚNICA extensão livre. Um tipo novo obrigaria migração de enum e apareceria em toda tela que
     * desenha marcos — para um texto que é, literalmente, uma nota.
     *
     * Na MESMA transação da ordem: se a ordem não nascer, a nota não existe. O contrário — nota sem
     * troca — seria pior que não registrar, porque afirmaria algo que não aconteceu.
     */
    if (ehTroca && motivo) {
      await tx.insert(tripEvents).values({
        tripId: entrada.tripId,
        eventType: "note",
        source: "operator_manual",
        actorUserId: entrada.requestedBy,
        eventTimestamp: new Date(),
        notes: `Troca de atribuição: ${motivo}`,
      });
    }

    return paraOrdem(linha[0]!);
  });
}

/**
 * O que o robô tem a fazer agora, já marcado como pego.
 *
 * MARCA E DEVOLVE NA MESMA IDA, e não "lê agora, marca depois". Entre as duas, um segundo robô — ou
 * o mesmo, num ciclo que se sobrepôs porque o anterior demorou — pegaria a mesma ordem, e o
 * fornecedor receberia o POST duas vezes. `FOR UPDATE SKIP LOCKED` é o que faz duas leituras
 * concorrentes devolverem conjuntos diferentes em vez do mesmo.
 *
 * `limite` pequeno de propósito: a fila é de decisão humana, não de volume. Mandar dez POSTs de uma
 * vez ao portal por causa de dez cliques é o tipo de rajada que faz um fornecedor desconfiar.
 */
/**
 * QUANTO TEMPO UMA ORDEM VALE (2026-08-28, a pedido).
 *
 * ── O QUE ACONTECIA SEM ISTO ──────────────────────────────────────────────────────────────────
 *
 * A ordem ficava `pending` para sempre. O sistema caiu durante uma atualização, alguém atribuiu, a
 * ordem não saiu — e quando o robô voltou, ela saiu SOZINHA, minutos depois, sem ninguém esperando
 * por aquilo. Foi o próprio usuário quem descreveu: "a atribuição não foi, mas quando o sistema
 * voltou foi automático, ficou na fila; eu queria que desse erro e a pessoa fizesse de novo".
 *
 * Uma atribuição não é uma tarefa de fundo que pode acontecer a qualquer hora: ela é a decisão de
 * alguém que está OLHANDO a tela. Executada dez minutos depois, ela chega num mundo diferente —
 * outra pessoa já pode ter escalado, a viagem pode ter mudado — e ninguém liga o efeito à causa.
 *
 * ── POR QUE PRAZO, E NÃO OUTRA FILA ───────────────────────────────────────────────────────────
 *
 * A pergunta que veio junto foi se um broker (RabbitMQ) resolveria. Não resolveria, e por um
 * motivo que não é de tecnologia: broker também é FILA. A mensagem esperaria lá do mesmo jeito e
 * sairia atrasada igual. O que faltava nunca foi onde a ordem espera — era ela ter VALIDADE.
 *
 * (Broker externo, aliás, é excluído pela constituição do projeto: a fila é Postgres, um worker.)
 *
 * ── TRÊS MINUTOS ──────────────────────────────────────────────────────────────────────────────
 *
 * O caminho normal leva segundos: o robô pergunta de poucos em poucos segundos e o portal responde
 * na hora. Três minutos é folga generosa para uma lentidão de rede e curto o bastante para que a
 * pessoa ainda esteja na tela quando o erro aparecer — que é o ponto.
 */
const VALIDADE_DA_ORDEM_MIN = 3;

/**
 * Fecha como falha as ordens que passaram do prazo sem serem executadas.
 *
 * Roda nos DOIS caminhos — quando o robô pede trabalho e quando a tela pergunta o estado. O
 * segundo é o que importa para quem está esperando: sem ele, a ordem expirada continuaria
 * aparecendo como "em voo" numa tela que ninguém mais vai atender.
 *
 * `pending` apenas. Ordem já `sent` está com o robô, e matá-la criaria o pior dos dois mundos: a
 * tela diria que falhou enquanto o portal recebe.
 */
export async function expirarOrdensVencidas(): Promise<number> {
  const r = await db
    .update(portalCommands)
    .set({
      status: "failed",
      lastError: "expirou: a ordem não foi executada a tempo e não será enviada ao portal",
      settledAt: new Date(),
    })
    .where(
      and(
        eq(portalCommands.status, "pending"),
        lt(portalCommands.requestedAt, new Date(Date.now() - VALIDADE_DA_ORDEM_MIN * 60_000)),
      ),
    )
    .returning({ id: portalCommands.id });
  return r.length;
}

export async function pegarOrdensPendentes(limite = 5): Promise<OrdemDoPortal[]> {
  // Antes de entregar trabalho, descarta o que venceu — senão o robô que volta de uma queda
  // executaria ordens que ninguém mais espera. Ver `VALIDADE_DA_ORDEM_MIN`.
  await expirarOrdensVencidas();
  return db.transaction(async (tx) => {
    const candidatas = await tx
      .select({ id: portalCommands.id })
      .from(portalCommands)
      .where(eq(portalCommands.status, "pending"))
      .orderBy(asc(portalCommands.requestedAt))
      .limit(limite)
      .for("update", { skipLocked: true });
    if (candidatas.length === 0) return [];

    const linhas = await tx
      .update(portalCommands)
      .set({
        status: "sent",
        claimedAt: new Date(),
        attempts: sql`${portalCommands.attempts} + 1`,
      })
      .where(
        inArray(
          portalCommands.id,
          candidatas.map((c) => c.id),
        ),
      )
      .returning();
    return linhas.map(paraOrdem);
  });
}

/**
 * O que o portal respondeu.
 *
 * A resposta CRUA é guardada mesmo no sucesso: é o que sobra para diagnosticar quando alguém
 * pergunta por que uma viagem aceita continua "Em análise" na leitura seguinte — pergunta que só
 * aparece dias depois, quando ninguém mais tem a tela aberta.
 *
 * Só transiciona a partir de `sent`: um relatório atrasado, de uma ordem que outro caminho já
 * encerrou, não pode reabrir nada.
 */
export async function encerrarOrdemDoPortal(entrada: {
  id: string;
  ok: boolean;
  response?: unknown;
  error?: string | null;
  /** O corpo cru do `/trip/detail`, relido pelo robô logo depois da ação. Ver o bloco abaixo. */
  confirmacao?: unknown;
}): Promise<{ encerrada: boolean; confirmada: boolean }> {
  const agora = new Date();

  // Lida ANTES do `update` porque a comparação precisa do que foi ENVIADO — placas, ação e o id do
  // portal —, e o `update` devolve a linha já encerrada. Ler antes também não muda nada se a ordem
  // não estiver mais em `sent`: o `where` do update é que decide, e ele continua sendo a trava.
  const ordemPrevia = (
    await db
      .select({
        action: portalCommands.action,
        portalTripId: portalCommands.portalTripId,
        plates: portalCommands.plates,
        driverId: portalCommands.driverId,
        secondDriverId: portalCommands.secondDriverId,
      })
      .from(portalCommands)
      .where(eq(portalCommands.id, entrada.id))
      .limit(1)
  )[0];

  /**
   * OS NOMES DE QUEM FOI ESCALADO — para a confirmação poder comparar (2026-09-04).
   *
   * A ordem guarda o ID do motorista NO PORTAL; a releitura do portal devolve o NOME
   * (`driver_name`) e nenhum id. Sem esta tradução não há como perguntar "é a mesma pessoa?", e era
   * justamente essa pergunta que não estava sendo feita — a confirmação olhava só a placa, que é a
   * mesma independentemente de quem dirige.
   *
   * Quem não estiver no nosso cadastro simplesmente não entra na lista, e aí a conferência do
   * motorista não acontece para aquela ordem. Falta de dado NOSSO não pode reprovar o portal.
   */
  const idsEscalados = [ordemPrevia?.driverId, ordemPrevia?.secondDriverId]
    .filter((d): d is number => d != null)
    .map(String);
  const nomesEscalados =
    idsEscalados.length === 0
      ? []
      : (
          await db
            .select({ nome: drivers.name })
            .from(drivers)
            .where(inArray(drivers.portalDriverId, idsEscalados))
        ).map((d) => d.nome);

  /**
   * A SEGUNDA PERGUNTA: "e aí, mudou?" (2026-08-28, a pedido).
   *
   * `retcode: 0` é o portal dizendo que RECEBEU a chamada. O `done` significava isso e o popup
   * fechava dizendo "deu certo" — sem ninguém ter conferido se a viagem mudou de estado lá.
   *
   * Agora o robô relê a viagem pelo `/trip/detail` logo depois da ação e manda o corpo cru junto.
   * Aqui ele é traduzido pelo MESMO mapeador da importação (nunca um segundo parser: dois
   * divergem em silêncio) e comparado com o que saiu daqui.
   *
   * `done` passou a significar "o portal atendeu E mostra o estado novo". Não houve estado nem
   * coluna nova: o popup já esperava `done`, e o que mudou foi a exigência por trás dele.
   *
   * ── ROBÔ ANTIGO NÃO VIRA FALHA ────────────────────────────────────────────────────────────
   *
   * O userscript se publica à mão e vai ficar atrás do servidor por um tempo. Sem `confirmacao`, a
   * ordem fecha como antes e a auditoria registra `nao_verificado` — que é diferente de registrar
   * que foi verificada. Tratar ausência como falha derrubaria a operação inteira no deploy.
   */
  const veredito = ((): Veredito | null => {
    if (!entrada.ok || entrada.confirmacao == null) return null;
    const acao = ordemPrevia?.action;
    if (acao !== "accept" && acao !== "reject" && acao !== "assign") return null;
    /**
     * O `/trip/detail` devolve UMA viagem em `data`, não uma lista (2026-08-29, consertando o
     * mesmo dia em que subiu).
     *
     * Eu tinha usado `mapPortalApiTrips`, que lê `data.list[]` — a forma da LISTAGEM. Contra o
     * detalhe ela não acha nada, e o "não achei" virava `confirmado: false`. Resultado medido em
     * produção: quatro atribuições marcadas como FALHA enquanto o portal mostrava todas como
     * `Assigned`. Elas tinham funcionado.
     *
     * ── E A LIÇÃO SE REPETIU ────────────────────────────────────────────────────────────────────
     *
     * É a MESMA de ontem com a recusa: só uma contradição POSITIVA pode reprovar. Não conseguir
     * interpretar a releitura é ignorância nossa, não desacordo do portal — e ignorância devolve
     * `null`, que deixa a ordem passar como não verificada.
     *
     * A forma vem documentada em `mapPortalApiDetail`:
     *   { retcode, message, data: { trip_number, acceptance_status, vehicle_number, … } }
     */
    const cru = (entrada.confirmacao as { data?: Record<string, unknown> } | null)?.data;
    if (!cru || typeof cru !== "object") {
      return { confirmado: null, motivo: "a releitura do portal veio sem corpo que eu saiba ler" };
    }
    const texto = (v: unknown): string | null =>
      typeof v === "string" && v.trim() !== "" ? v.trim() : null;
    const alvo = {
      acceptanceStatus:
        typeof cru.acceptance_status === "number"
          ? cru.acceptance_status === 1
            ? "Accepted"
            : "Pending"
          : null,
      status: null,
      plateLabel: texto(cru.vehicle_number),
      driverLabel: texto(cru.driver_name),
    };
    // Sem os campos que a regra precisa, o detalhe não serve para confirmar NEM para desmentir.
    if (alvo.acceptanceStatus == null && alvo.plateLabel == null) {
      return {
        confirmado: null,
        motivo: "a releitura não trouxe aceitação nem placa — nada a conferir",
      };
    }
    return confirmarAcaoNoPortal({
      acao,
      enviadas: (ordemPrevia?.plates ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
      motoristasEnviados: nomesEscalados,
      portal: alvo,
    });
  })();

  // O portal atendeu, mas a releitura desmentiu: isso é falha, e a mensagem diz por quê.
  const deuCerto = entrada.ok && veredito?.confirmado !== false;
  const linhas = await db
    .update(portalCommands)
    .set({
      status: deuCerto ? "done" : "failed",
      response: (entrada.response ?? null) as never,
      lastError: deuCerto
        ? null
        : veredito && !veredito.confirmado
          ? `o portal respondeu OK mas não confirmou: ${veredito.motivo}`
          : (entrada.error?.slice(0, 500) ?? "sem detalhe"),
      settledAt: agora,
    })
    .where(and(eq(portalCommands.id, entrada.id), eq(portalCommands.status, "sent")))
    .returning();
  const ordem = linhas[0];
  if (!ordem) return { encerrada: false, confirmada: false };

  /**
   * A PROVA, gravada fora da transação do clique.
   *
   * Não vai junto do `update` numa transação porque um erro ao escrever a auditoria não pode
   * desfazer o encerramento: a ordem JÁ foi executada no portal, e voltar atrás no nosso lado
   * criaria uma ordem eternamente `sent` que o robô tentaria de novo — mandando a mesma ação duas
   * vezes ao fornecedor. Perder uma linha de auditoria é ruim; atribuir em dobro é pior.
   *
   * `respostaDoPortal` guarda o corpo COMO VEIO. Sem normalizar, sem extrair só o `retcode`: o
   * dia em que o portal mudar o formato, quem ler esta linha precisa ver o que chegou de fato, não
   * a nossa leitura de então.
   */
  const acao = ACAO_DO_DESFECHO[ordem.action as keyof typeof ACAO_DO_DESFECHO];
  if (acao) {
    const partiu = ordem.claimedAt ?? ordem.requestedAt;
    await writeAudit(db, {
      actorUserId: ordem.requestedBy,
      action: acao,
      entityType: "trip",
      entityId: ordem.tripId,
      previousValue: null,
      newValue: {
        commandId: ordem.id,
        portalTripId: ordem.portalTripId,
        externalTripId: ordem.externalTripId,
        desfecho: !deuCerto
          ? veredito?.confirmado === false
            ? "o portal respondeu OK e a releitura desmentiu"
            : "recusado pelo portal"
          : veredito?.confirmado === true
            ? "confirmado no portal"
            : veredito?.confirmado === null
              ? "aceito pelo portal, sem confirmação possível"
              : "aceito pelo portal, NÃO VERIFICADO",
        /**
         * A CONFERÊNCIA, e o `nao_verificado` é informação, não lacuna.
         *
         * Enquanto o userscript não for republicado ele não manda a releitura, e a ordem fecha na
         * palavra do `retcode` como sempre fez. Registrar isso como "não verificado" é o que
         * impede alguém, meses depois, de ler uma linha antiga e achar que ela foi conferida.
         */
        conferencia:
          veredito == null
            ? { confirmado: null, motivo: "nao_verificado: o robô não enviou releitura" }
            : veredito.confirmado === true
              ? {
                  confirmado: true,
                  detalhe: veredito.detalhe,
                  placasConferidas: veredito.placasConferidas,
                }
              : { confirmado: veredito.confirmado, motivo: veredito.motivo },
        // A palavra do portal, sem tradução nossa.
        respostaDoPortal: (entrada.response ?? null) as never,
        /**
         * O CORPO DA RELEITURA, guardado como veio (2026-08-29).
         *
         * Três iterações em produção foram gastas adivinhando o formato do `/trip/detail`: primeiro
         * usei o parser da listagem, depois exigi um campo que ele não traz. Cada rodada custou
         * atribuições marcadas como falha e um deploy.
         *
         * A causa de fundo era não ter o corpo em lugar nenhum: ele chegava, era interpretado e
         * jogado fora. Guardá-lo transforma a próxima dúvida numa consulta, não num palpite —
         * e é o mesmo motivo pelo qual `respostaDoPortal` já era guardada sem tradução.
         */
        releituraDoPortal: (entrada.confirmacao ?? null) as never,
        erro: entrada.ok ? null : (entrada.error?.slice(0, 500) ?? "sem detalhe"),
        tentativa: ordem.attempts,
        // Separa "demorou" de "não foi" — foi a pergunta da operação em 28/08.
        segundos: partiu ? Math.round((agora.getTime() - partiu.getTime()) / 100) / 10 : null,
        // O que SAIU daqui, para comparar com o que o portal devolveu.
        placasEnviadas: ordem.plates,
        driverId: ordem.driverId,
        secondDriverId: ordem.secondDriverId,
      },
    });
  }
  return { encerrada: true, confirmada: deuCerto };
}

/** As ordens desta viagem, da mais nova para a mais velha — é o que a tela mostra ao lado do botão. */
export async function ordensDaViagem(tripId: string, limite = 5): Promise<OrdemDoPortal[]> {
  /*
   * EXPIRA ANTES DE LER, e é aqui que isso mais importa.
   *
   * Esta é a leitura que a TELA faz enquanto alguém espera. Sem a expiração acontecendo neste
   * caminho, uma ordem vencida continuaria aparecendo como "em voo" para quem está olhando — e a
   * pessoa esperaria por algo que nunca vai ser executado.
   *
   * O outro caminho (o robô pedindo trabalho) também expira, mas ele pode não voltar tão cedo: é
   * justamente o caso da queda. Depender só dele deixaria a tela mentindo enquanto isso.
   */
  await expirarOrdensVencidas();
  const linhas = await db
    .select()
    .from(portalCommands)
    .where(eq(portalCommands.tripId, tripId))
    .orderBy(sql`${portalCommands.requestedAt} desc`)
    .limit(limite);
  return linhas.map(paraOrdem);
}

/** Quais destas viagens já têm ordem em voo — para a lista desenhar o botão certo sem N consultas. */
export async function viagensComOrdemAberta(tripIds: string[]): Promise<Set<string>> {
  if (tripIds.length === 0) return new Set();
  const linhas = await db
    .select({ tripId: portalCommands.tripId })
    .from(portalCommands)
    .where(
      and(inArray(portalCommands.tripId, tripIds), inArray(portalCommands.status, [...ABERTAS])),
    );
  return new Set(linhas.map((l) => l.tripId));
}

function paraOrdem(r: typeof portalCommands.$inferSelect): OrdemDoPortal {
  return {
    id: r.id,
    tripId: r.tripId,
    externalTripId: r.externalTripId,
    portalTripId: r.portalTripId,
    action: r.action,
    reasonId: r.reasonId,
    remark: r.remark,
    driverId: r.driverId,
    secondDriverId: r.secondDriverId,
    plates: (r.plates ?? "").split(",").filter(Boolean),
    platesInternas: (r.platesInternas ?? "").split(",").filter(Boolean),
    status: r.status,
    attempts: r.attempts,
    lastError: r.lastError,
    requestedAt: r.requestedAt.toISOString(),
    settledAt: r.settledAt?.toISOString() ?? null,
  };
}
