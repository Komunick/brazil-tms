import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  impedimentoDaAcao,
  impedimentoDaAtribuicao,
  impedimentoParaAtribuir,
  motivoValido,
  normalizarPlaca,
  type ImpedimentoDaAcao,
  type ImpedimentoDaAtribuicao,
  type ImpedimentoParaAtribuir,
  type PortalAction,
} from "@brazil-tms/shared";
import { db } from "../client";
import { drivers, portalCommands, trips } from "../../schema";
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
        plates:
          entrada.action === "assign"
            ? (entrada.plates ?? []).map(normalizarPlaca).filter(Boolean).join(",")
            : null,
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
      },
    });
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
export async function pegarOrdensPendentes(limite = 5): Promise<OrdemDoPortal[]> {
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
}): Promise<boolean> {
  const linhas = await db
    .update(portalCommands)
    .set({
      status: entrada.ok ? "done" : "failed",
      response: (entrada.response ?? null) as never,
      lastError: entrada.ok ? null : (entrada.error?.slice(0, 500) ?? "sem detalhe"),
      settledAt: new Date(),
    })
    .where(and(eq(portalCommands.id, entrada.id), eq(portalCommands.status, "sent")))
    .returning({ id: portalCommands.id });
  return linhas.length > 0;
}

/** As ordens desta viagem, da mais nova para a mais velha — é o que a tela mostra ao lado do botão. */
export async function ordensDaViagem(tripId: string, limite = 5): Promise<OrdemDoPortal[]> {
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
    status: r.status,
    attempts: r.attempts,
    lastError: r.lastError,
    requestedAt: r.requestedAt.toISOString(),
    settledAt: r.settledAt?.toISOString() ?? null,
  };
}
