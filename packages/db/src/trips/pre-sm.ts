import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { writeAudit } from "../audit/write-audit";
import { drivers, tripPreSm, trips } from "../../schema";

/**
 * O ESTADO DA PRÉ-SM DE UMA VIAGEM (2026-08-25, fatia 026).
 *
 * Ver `schema/trip-pre-sm.ts` para o desenho. O que importa aqui:
 *
 * **Uma viagem tem VÁRIAS linhas ao longo do tempo** — a cancelada, a recusada, a que valeu. Nova
 * tentativa INSERE; nunca atualiza uma linha morta. Ressuscitar apagaria o rastro (constituição,
 * princípio III) e furaria o índice único parcial, que só verifica no `insert`.
 *
 * **Ler o estado é ler a linha VIVA** (pendente ou criada) ou, quando não há, a mais recente.
 */

export type PreSmStatus = "pendente" | "criada" | "recusada" | "sem_dados" | "cancelada";

export interface PreSmDaViagem {
  id: string;
  tripId: string;
  status: PreSmStatus;
  codigo: string | null;
  codModelo: number | null;
  motivo: string | null;
  requestedAt: string;
  settledAt: string | null;
  tentativas: number;
}

const VIVAS: PreSmStatus[] = ["pendente", "criada"];

/**
 * Abre uma tentativa — e devolve `null` quando já existe uma viva.
 *
 * O `null` vem do índice único parcial, não de um `select` anterior: entre o `select` e o `insert`
 * cabe uma segunda execução do job, e a gerenciadora COBRA por solicitação. A colisão é a garantia,
 * e tratá-la como "já existe" em vez de estourar é o que faz o reprocesso ser inofensivo (FR-002).
 */
export async function abrirTentativaDePreSm(entrada: {
  tripId: string;
  codModelo: number | null;
  payloadEnviado: unknown;
}): Promise<PreSmDaViagem | null> {
  const linhas = await db
    .insert(tripPreSm)
    .values({
      tripId: entrada.tripId,
      status: "pendente",
      codModelo: entrada.codModelo,
      payloadEnviado: (entrada.payloadEnviado ?? null) as never,
    })
    .onConflictDoNothing()
    .returning();

  return linhas[0] ? paraView(linhas[0]) : null;
}

/** Fecha a tentativa: criada (com o código), recusada (com a mensagem dela) ou sem_dados. */
export async function encerrarTentativaDePreSm(entrada: {
  id: string;
  status: Exclude<PreSmStatus, "pendente">;
  codigo?: string | null;
  motivo?: string | null;
}): Promise<void> {
  await db
    .update(tripPreSm)
    .set({
      status: entrada.status,
      codigo: entrada.codigo ?? null,
      motivo: entrada.motivo ?? null,
      settledAt: new Date(),
    })
    .where(eq(tripPreSm.id, entrada.id));
}

/** Mais uma tentativa contada — é o que distingue "ainda tentando" de "desistiu" (FR-015). */
export async function contarTentativa(id: string): Promise<number> {
  const [linha] = await db
    .update(tripPreSm)
    .set({ tentativas: sql`${tripPreSm.tentativas} + 1` })
    .where(eq(tripPreSm.id, id))
    .returning({ n: tripPreSm.tentativas });
  return linha?.n ?? 0;
}

/**
 * O estado de uma viagem: a linha viva, ou a mais recente quando não há viva.
 *
 * Nunca "a linha" no singular — ver o comentário do topo.
 */
export async function preSmDaViagem(tripId: string): Promise<PreSmDaViagem | null> {
  const linhas = await db
    .select()
    .from(tripPreSm)
    .where(eq(tripPreSm.tripId, tripId))
    .orderBy(
      // Viva primeiro, depois a mais recente. Sem o primeiro critério, uma cancelada de hoje
      // esconderia a criada de ontem que ainda vale.
      sql`case when ${tripPreSm.status} in ('pendente','criada') then 0 else 1 end`,
      sql`${tripPreSm.requestedAt} desc`,
    )
    .limit(1);
  return linhas[0] ? paraView(linhas[0]) : null;
}

/** As de várias viagens de uma vez — para a lista não fazer uma consulta por linha. */
export async function preSmDeVariasViagens(tripIds: string[]): Promise<Map<string, PreSmDaViagem>> {
  if (tripIds.length === 0) return new Map();
  const linhas = await db
    .select()
    .from(tripPreSm)
    .where(and(inArray(tripPreSm.tripId, tripIds), inArray(tripPreSm.status, VIVAS)));
  return new Map(linhas.map((l) => [l.tripId, paraView(l)]));
}

/**
 * Quantas nasceram HOJE — o que o teto diário limita.
 *
 * Conta só as que existem de verdade na gerenciadora (`criada`): as recusadas e as `sem_dados` não
 * custaram nada, e contá-las gastaria o teto sem ninguém ter sido cobrado.
 *
 * O dia é o de São Paulo, não UTC: o teto é uma régua de operação, e a operação vira o dia às
 * 00h de Brasília.
 */
export async function criadasHoje(): Promise<number> {
  const [linha] = await db
    .select({ n: count() })
    .from(tripPreSm)
    .where(
      and(
        eq(tripPreSm.status, "criada"),
        gte(
          tripPreSm.settledAt,
          sql`date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'`,
        ),
      ),
    );
  return linha?.n ?? 0;
}

function paraView(l: typeof tripPreSm.$inferSelect): PreSmDaViagem {
  return {
    id: l.id,
    tripId: l.tripId,
    status: l.status as PreSmStatus,
    codigo: l.codigo,
    codModelo: l.codModelo,
    motivo: l.motivo,
    requestedAt: l.requestedAt.toISOString(),
    settledAt: l.settledAt?.toISOString() ?? null,
    tentativas: l.tentativas,
  };
}

/** Uma linha pelo id — o que o job de cancelamento precisa para saber o que cancelar. */
export async function preSmPorId(id: string): Promise<PreSmDaViagem | null> {
  const [l] = await db.select().from(tripPreSm).where(eq(tripPreSm.id, id)).limit(1);
  return l ? paraView(l) : null;
}

/**
 * Registra na auditoria QUEM pediu o cancelamento.
 *
 * Fica no pedido e não no worker de propósito: o worker sabe o que aconteceu com a gerenciadora, e
 * não quem quis que acontecesse. Quando alguém for perguntar "por que essa Pré-SM foi cancelada",
 * o nome é o que importa.
 */
export async function registrarPedidoDeCancelamento(entrada: {
  tripId: string;
  preSmId: string;
  actorUserId: string;
}): Promise<void> {
  await writeAudit(db, {
    actorUserId: entrada.actorUserId,
    action: "pre_sm.cancelar",
    entityType: "trip",
    entityId: entrada.tripId,
    previousValue: { preSm: entrada.preSmId, status: "criada" },
    newValue: { preSm: entrada.preSmId, status: "cancelamento_pedido" },
  });
}

/**
 * O ESTADO DA PRÉ-SM **com o que a viagem tem agora** — para a tela apontar divergência (FR-018).
 *
 * Devolve o corpo que foi enviado e a atribuição atual lida do portal. A comparação em si é pura e
 * vive em `packages/shared` (`divergenciasDaPreSm`), porque comparar é regra e regra se testa.
 *
 * A atribuição atual sai de `customer_fields` — o que o robô leu por último, que é o que o CLIENTE
 * enxerga hoje. É o lado certo da comparação: a pergunta é "a Pré-SM ainda descreve quem vai
 * dirigir?", e quem responde isso é o portal, não a nossa última ordem.
 */
export async function preSmComAtribuicaoAtual(tripId: string): Promise<{
  preSm: PreSmDaViagem | null;
  payloadEnviado: Record<string, unknown> | null;
  atual: { cpfMotorista: string | null; placas: string[] } | null;
}> {
  const preSm = await preSmDaViagem(tripId);
  if (!preSm) return { preSm: null, payloadEnviado: null, atual: null };

  const [linha] = await db
    .select({
      payload: tripPreSm.payloadEnviado,
      placas: sql<string | null>`(${trips.customerFields} ->> 'Placa (portal)')`,
      portalDriverId: sql<string | null>`(${trips.customerFields} ->> 'ID do motorista (portal)')`,
    })
    .from(tripPreSm)
    .innerJoin(trips, eq(trips.id, tripPreSm.tripId))
    .where(eq(tripPreSm.id, preSm.id))
    .limit(1);

  if (!linha) return { preSm, payloadEnviado: null, atual: null };

  const [motorista] = linha.portalDriverId
    ? await db
        .select({ cpf: drivers.cpf })
        .from(drivers)
        .where(eq(drivers.portalDriverId, linha.portalDriverId))
        .limit(1)
    : [];

  return {
    preSm,
    payloadEnviado: (linha.payload as Record<string, unknown> | null) ?? null,
    atual: {
      cpfMotorista: motorista?.cpf ?? null,
      placas: (linha.placas ?? "")
        .split(/[,;]/)
        .map((p) => p.trim())
        .filter(Boolean),
    },
  };
}
