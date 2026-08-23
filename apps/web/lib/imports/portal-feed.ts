import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  mapPortalApiDetail,
  mapPortalApiTrips,
  type PortalApiEnvelope,
  type PortalParseResult,
  type PortalTrip,
} from "@brazil-tms/shared";
import { customers, db, importBatches, trips, users } from "@brazil-tms/db";
import { Conflict, NotFound } from "@/lib/api/respond";
import {
  applyParsedPortalTrips,
  closePortalBatch,
  type PortalImportMode,
  type PortalImportResult,
} from "@/lib/imports/portal-execution-import";
import type { PortalPlanOptions } from "@brazil-tms/db";

/**
 * The robot's door into the TMS (2026-08-16).
 *
 * A script on a logged-in machine reads the customer's portal every few minutes and POSTs one page
 * of its API response here, verbatim. Everything it sends is data, never instructions: the payload
 * is mapped by `mapPortalApiTrips` and then walks the SAME path an uploaded export walks
 * (`applyParsedPortalTrips`). The script cannot choose what happens to a trip; it can only say
 * "this is what the portal answered".
 *
 * The script stays deliberately thin — fetch and forward — because it lives on a VM where updating
 * it is a manual chore and testing it is impossible. Every judgement lives here, under test.
 */

/**
 * Qual das TRÊS listagens do portal chegou (2026-08-16).
 *
 * O modo de importação do TMS tem dois valores — quem pode criar viagem e quem não pode — e isso
 * continua certo. Mas o robô lê três abas, e duas delas podem criar:
 *
 *   Planejado ("plan")        → a viagem antes de sair. Cria.
 *   Aceito    ("in_progress") → a viagem NA ESTRADA agora. Cria também, e é por isso que este modo
 *                               existe: medido no portal, 49 das 73 viagens em curso não existiam no
 *                               TMS. Elas foram aceitas antes de o robô começar a olhar o Planejado,
 *                               nunca passaram por lá enquanto olhávamos, e iam rodar e terminar sem
 *                               o sistema saber que existiram — porque o caminho de execução, por
 *                               regra, nunca cria.
 *   Concluído ("execution")   → o que já acabou. NUNCA cria: aplicar isto como plano fabricaria
 *                               milhares de viagens encerradas que ninguém pode tocar.
 *
 * O modo separado (em vez de mandar a aba "Aceito" como `plan`) é o que mantém o histórico de
 * importação legível: quem abrir a lista vê "Robô · Em curso" e sabe de onde aquilo veio.
 */
export type PortalFeedMode = "plan" | "in_progress" | "execution" | "history";

/**
 * O que cada aba pode fazer, e o que acontece ao concluir.
 *
 * `execution` é a leitura contínua do Concluído: acompanha o que TERMINOU nas últimas horas de
 * viagens que o TMS já vinha seguindo, e conclui pelo caminho normal — entra na fila de faturamento
 * e ganha item, porque é uma viagem que a operação de vocês executou sob o olhar do sistema.
 *
 * `history` é o BACKFILL (2026-08-17). O TMS começa em 06/08 e o histórico do portal vai a 18/07:
 * três semanas de viagens que nunca entraram, mais dias irregulares no meio, porque vieram de
 * uploads de CSV e não de varredura. Este modo CRIA o que falta e fecha com o que o portal diz —
 * `Completed` vira **Concluída**, `Cancelled` vira **Cancelada**.
 *
 * Duas diferenças, e as duas existem para não estragar nada:
 *
 *   PARA EM "CONCLUÍDA". Não avança para faturamento pendente nem cria item. São ~1.400 viagens que
 *   rodaram antes de o TMS existir e já foram cobradas por fora; item de faturamento para elas faria
 *   dinheiro aparecer duas vezes, e isso não se desfaz com um clique.
 *
 *   NÃO VINCULA FROTA. Viagem encerrada há três semanas não precisa de atribuição, e criar vínculo
 *   em massa encheria o histórico de cada motorista de trabalho que ninguém fez aqui.
 */
function importModeFor(mode: PortalFeedMode): PortalImportMode {
  return mode === "execution" ? "execution" : "plan";
}

/** As opções que cada modo passa ao caminho do plano. Só o backfill muda alguma coisa. */
function planOptionsFor(mode: PortalFeedMode): PortalPlanOptions | undefined {
  if (mode !== "history") return undefined;
  return { onCompleted: "close_only", linkFleet: false, updatePlan: false };
}

const FEED_LABEL: Record<PortalFeedMode, { fileName: string; source: string }> = {
  plan: { fileName: "portal (plano)", source: "portal_robot_plan" },
  in_progress: { fileName: "portal (em curso)", source: "portal_robot_in_progress" },
  execution: { fileName: "portal (execução)", source: "portal_robot_execution" },
  history: { fileName: "portal (histórico)", source: "portal_robot_history" },
};

export interface PortalFeedResult extends PortalImportResult {
  /** The batch this run recorded, or null when it changed nothing (see `worthRecording`). */
  batchId: string | null;
  /** Trips whose assignment operator is still unknown — the robot fetches these in detail. */
  needDetail: string[];
}

/**
 * Did this run do anything worth a line in the import history?
 *
 * A robot polling every few minutes would otherwise write ~300 history rows a day, all of them
 * saying "nothing changed", and bury the handful that matter. So a quiet run is silent: it is
 * recorded only when it moved a trip, or when it hit something a person must act on — an unresolved
 * station, a failure, a rejected trip.
 */
function worthRecording(result: PortalImportResult): boolean {
  const plan = result.planSummary;
  const exec = result.summary;
  return (
    (plan?.created ?? 0) > 0 ||
    (plan?.updated ?? 0) > 0 ||
    (plan?.cancelled ?? 0) > 0 ||
    (plan?.failed ?? 0) > 0 ||
    (plan?.milestones ?? 0) > 0 ||
    (exec?.applied ?? 0) > 0 ||
    (exec?.closed ?? 0) > 0 ||
    result.unknownStations.length > 0 ||
    result.rejected.length > 0
  );
}

async function activeCustomerId(customerCode: string): Promise<string> {
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.customerCode, customerCode), isNull(customers.archivedAt)))
    .limit(1);
  const id = rows[0]?.id;
  if (!id) throw new Conflict("UNKNOWN_CUSTOMER", `Cliente ${customerCode} não encontrado.`);
  return id;
}

/**
 * WHO the robot acts as. A service account, configured by e-mail (`PORTAL_FEED_ACTOR_EMAIL`) rather
 * than hardcoded, so every trip event and audit row the feed writes names a real, revocable user —
 * and so nobody has to wonder later which human "did" 500 status changes at 3am.
 */
async function feedActorId(): Promise<string> {
  const email = process.env.PORTAL_FEED_ACTOR_EMAIL;
  if (!email) {
    throw new Conflict(
      "FEED_ACTOR_UNSET",
      "PORTAL_FEED_ACTOR_EMAIL não configurado: o robô precisa de um usuário de serviço.",
    );
  }
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  const id = rows[0]?.id;
  if (!id) throw new NotFound("FEED_ACTOR_NOT_FOUND", `Usuário de serviço ${email} não existe.`);
  return id;
}

export async function ingestPortalFeed(input: {
  payload: PortalApiEnvelope;
  mode: PortalFeedMode;
  customerCode: string;
}): Promise<PortalFeedResult> {
  // The portal answers `retcode: 0` on success. Anything else means the script forwarded an error
  // page (an expired session, a station it has no permission for) — applying that as "no trips"
  // would silently look like a quiet day.
  if (input.payload?.retcode != null && input.payload.retcode !== 0) {
    throw new Conflict(
      "PORTAL_ERROR",
      `O portal respondeu erro ${input.payload.retcode}: ${String(input.payload.message ?? "").slice(0, 120)}`,
    );
  }

  const parsed = semAsPropostasEmAberto(mapPortalApiTrips(input.payload));
  const customerId = await activeCustomerId(input.customerCode);
  const actorUserId = await feedActorId();

  const result = await applyParsedPortalTrips({
    customerId,
    actorUserId,
    mode: importModeFor(input.mode),
    planOptions: planOptionsFor(input.mode),
    // What a trip's history will say moved it. "portal" — not a file name, because there is no file.
    sourceLabel: "portal",
    rows: Array.isArray(input.payload?.data?.list) ? input.payload.data!.list!.length : 0,
    parsed,
  });

  const needDetail = await tripsMissingAssignOperator(customerId, parsed.trips);

  if (!worthRecording(result)) return { ...result, batchId: null, needDetail };

  const batchId = crypto.randomUUID();
  const label = FEED_LABEL[input.mode];
  await db.insert(importBatches).values({
    id: batchId,
    customerId,
    fileName: label.fileName,
    // There is no uploaded file to keep: the payload is re-readable from the portal at any time, and
    // storing every poll would fill the bucket with copies of the same 500 trips.
    storageKey: "",
    uploadedBy: actorUserId,
    source: label.source,
    status: "confirming",
    totalRows: result.rows,
  });
  await closePortalBatch(batchId, importModeFor(input.mode), result);

  return { ...result, batchId, needDetail };
}

/**
 * FORA AS PROPOSTAS EM ABERTO — as viagens que não são nossas (2026-08-23, a pedido).
 *
 * O Planejado do portal mistura duas coisas: as viagens que a Shopee JÁ ENTREGOU à Brazil
 * Transports e as que ela ainda está oferecendo, sem dono. As segundas vinham entrando como
 * viagem nossa — pediam atribuição, contavam no painel e, desde o conserto das faixas, acendiam
 * a LH ATRASADA. Vinte e quatro delas estavam de vermelho na tela quando o usuário olhou as
 * rotas e disse a frase que abriu isto: "nenhuma dessas rotas é nossa".
 *
 * O portal sempre disse de quem era: `agency_id`. Medido em 2026-08-23 no mesmo payload que o
 * robô lê — 204 viagens, 169 com `1450 · BRAZIL TRANSPORTS` e 35 com `0` e nome vazio.
 *
 * ── REJEITADA, E NÃO IGNORADA ─────────────────────────────────────────────────────────────
 *
 * Elas entram na lista de rejeitadas do lote, com o motivo escrito. Descartar em silêncio faria
 * o dia em que o portal mudar o campo passar despercebido: a alimentação continuaria "sem erro"
 * e o TMS ficaria vazio. Rejeição é um número que aparece.
 *
 * ── E QUEM JÁ ESTÁ DENTRO SAI SOZINHO ──────────────────────────────────────────────────────
 *
 * Sem apagar nada à mão. Parando de alimentá-las, elas viram ausência na listagem — e ausência
 * já tem dono: `marcarRetiradasDoPortal` apaga em três horas o que sumiu do portal, com as cinco
 * travas dela e auditoria por viagem. É o mesmo caminho da proposta que o cliente retira, que é
 * exatamente o que estas são.
 *
 * QUEM NÃO DIZ, PASSA. `agencyId` nulo é origem que não traz o campo (planilha, e listagens do
 * portal que não o incluem). Ausência de informação não vira acusação — o filtro só age sobre o
 * zero explícito.
 */
export function semAsPropostasEmAberto(parsed: PortalParseResult): PortalParseResult {
  const emAberto = (t: PortalTrip) => t.agencyId === 0;
  if (!parsed.trips.some(emAberto)) return parsed;
  return {
    trips: parsed.trips.filter((t) => !emAberto(t)),
    rejected: [
      ...parsed.rejected,
      ...parsed.trips.filter(emAberto).map((t, i) => ({
        row: parsed.rejected.length + i + 1,
        externalTripId: t.externalTripId,
        reason: "Proposta em aberto no portal (sem transportadora): não é viagem nossa.",
      })),
    ],
  };
}

/** How many trips one answer may ask the robot to fetch in detail — one call each, so it is capped. */
const DETAIL_BATCH = 25;

/**
 * Which of these trips still lack the assignment operator (2026-08-16).
 *
 * `assign_operator` — who put a driver on the trip — lives ONLY in the portal's per-trip detail
 * endpoint, one HTTP call each. Asking for all 500 every cycle would be absurd; asking for none
 * means never having it. So the TMS names the few that are missing it, the robot fetches just those,
 * and the list shrinks to nothing on its own as they get filled.
 *
 * It asks ONLY about trips that already have a driver. Measured against the live portal: the detail
 * of a trip with a driver names the operator, and the detail of one without has no operator at all —
 * there was no assignment to attribute. Without this filter the 25-per-page budget was spent on the
 * ~460 trips that will never have one, and the 37 that did have one were rarely reached: the first
 * run recorded zero.
 */
async function tripsMissingAssignOperator(
  customerId: string,
  portalTrips: { externalTripId: string }[],
): Promise<string[]> {
  const ids = portalTrips.map((t) => t.externalTripId).filter(Boolean);
  if (ids.length === 0) return [];

  const rows = await db
    .select({ externalTripId: trips.externalTripId })
    .from(trips)
    .where(
      and(
        eq(trips.customerId, customerId),
        inArray(trips.externalTripId, ids),
        sql`(${trips.customerFields} ->> 'Motorista (portal)') is not null`,
        sql`(${trips.customerFields} ->> 'Operador de atribuição (portal)') is null`,
      ),
    )
    .limit(DETAIL_BATCH);

  return rows.map((r) => r.externalTripId).filter((v): v is string => Boolean(v));
}

/**
 * One trip's detail, forwarded by the robot: records who assigned it. Never creates a trip and never
 * touches the lifecycle — it fills one display field on a trip the TMS already has.
 */
export async function ingestPortalDetail(input: {
  payload: { retcode?: number; data?: Record<string, unknown> };
  customerCode: string;
}): Promise<{ externalTripId: string | null; recorded: boolean }> {
  const detail = mapPortalApiDetail(input.payload);
  if (!detail || !detail.assignOperator) {
    return { externalTripId: detail?.externalTripId ?? null, recorded: false };
  }

  const customerId = await activeCustomerId(input.customerCode);
  const existing = await db
    .select({ id: trips.id, customerFields: trips.customerFields })
    .from(trips)
    .where(and(eq(trips.customerId, customerId), eq(trips.externalTripId, detail.externalTripId)));
  if (existing.length === 0) return { externalTripId: detail.externalTripId, recorded: false };

  for (const trip of existing) {
    const current = (trip.customerFields ?? {}) as Record<string, string>;
    if (current["Operador de atribuição (portal)"] === detail.assignOperator) continue;
    await db
      .update(trips)
      .set({
        customerFields: { ...current, "Operador de atribuição (portal)": detail.assignOperator },
        updatedAt: new Date(),
      })
      .where(eq(trips.id, trip.id));
  }
  return { externalTripId: detail.externalTripId, recorded: true };
}
