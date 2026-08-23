import { DateTime } from "luxon";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  not,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../client";
import {
  billingAdjustments,
  billingItems,
  carriers,
  customers,
  customerSlaRules,
  documentRequirements,
  documentTypes,
  documents,
  drivers,
  exceptions,
  exportBatches,
  lanes,
  locations,
  rates,
  reasonCodes,
  trailers,
  tripAssignments,
  trips,
  users,
  vehicles,
} from "../../schema";
import {
  ACEITACAO_PENDENTE,
  ACTIVE_TRIP_STATUSES,
  BILLING_PHASE_STATUSES,
  EXPORT_ROW_CAP,
  billingStatus,
  billingStatusToStatuses,
  dayRangeSaoPaulo,
  monthRangeSaoPaulo,
  type BillingStatus,
  type ExceptionFilter,
  type TripBoardQuery,
  type TripExportQuery,
  type TripDisplayStatus,
  type TripStatus,
  regionPosition,
  APP_TIME_ZONE,
  termosDaBusca,
} from "@brazil-tms/shared";
import { Conflict } from "../errors";
import { loadTripDetail, type TripDetail } from "./trip-dto";
import { onTimeExpr } from "./on-time";
import { tripQueueSql } from "./portal-withdrawn";
import { readOrigemAtrasadaPorRegiao, readSpotPorRegiao } from "./programacao";
import { lateToAssignSql, origemAtrasadaSql } from "./atrasos";

/**
 * Feature 005 — Control Tower read models (board / detail / dashboard / export). These are the
 * READ surface over the 003 trip domain: a dense, server-side filtered/sorted/paginated board, an
 * enriched trip-detail view (003 `TripDetail` + the joined customer/location names), the daily
 * dashboard counts, and the capped synchronous CSV export. They add NO new table — origin and
 * destination both reference `locations`, so both joins use aliased copies of that table.
 *
 * Authorization (`view_all_trips`) and the BFF "before completion" edit guard live in the route
 * layer, not here. The board/export share ONE where+sort+joins builder so the filter logic is
 * never duplicated (DRY). `laneLabel` is DERIVED from the origin/destination codes (`O → D`) — there
 * is no lane name column — so no lane join is needed. Later-slice dimensions (assignment → 006,
 * SLA risk / exceptions → 007, documents/billing detail → 008) are returned as `null` placeholders.
 */

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface TripBoardRow {
  id: string;
  externalTripId: string | null;
  customerId: string;
  customerName: string;
  originCode: string;
  originName: string;
  /** A região operacional da estação de ORIGEM; nula enquanto a estação não for classificada. */
  originRegion: string | null;
  destinationCode: string;
  destinationName: string;
  laneLabel: string | null;
  currentStatus: TripStatus;
  billingStatus: BillingStatus;
  slaStatus: string | null;
  slaReasons: string[] | null;
  plannedPickupWindowStart: string | null;
  plannedPickupWindowEnd: string | null;
  plannedDeliveryWindowStart: string | null;
  plannedDeliveryWindowEnd: string | null;
  plannedVehicleType: string | null;
  updatedAt: string;
  // Feature 006 — current-assignment projection (data-model.md §5). `isAssigned` mirrors the
  // "Unassigned" view / row indicator; the names render the assigned-resource columns.
  isAssigned: boolean;
  assignedDriverName: string | null;
  assignedVehiclePlate: string | null;
  assignedCarrierName: string | null;
  /**
   * O que o CLIENTE respondeu sobre esta proposta — `Pending` ou `Accepted` (2026-08-18).
   *
   * Viaja com a linha porque é ele que desdobra "Recebida" em "Em análise" e "P/Atribuir" na tela.
   * Sem isto, o quadro teria de adivinhar ou fazer uma segunda consulta por linha.
   */
  portalAcceptance: string | null;
  portalDriverId: string | null;
  portalDriverName: string | null;
  portalPlate: string | null;
  /** O que o portal chama esta viagem — `Assigning` / `Assigned`. Ver `displayStatusOf`. */
  portalStatus: string | null;
}

export interface TripBoardResult {
  rows: TripBoardRow[];
  total: number;
  /**
   * How many trips each status holds under the current filters, ignoring the status filter itself —
   * what the board's status chips display. Absent key = zero (the chip is hidden).
   */
  statusCounts: Partial<Record<TripDisplayStatus, number>>;
}

export type TripDetailView = TripDetail & {
  customerName: string;
  originCode: string;
  originName: string;
  destinationCode: string;
  destinationName: string;
  laneLabel: string | null;
  importBatchId: string | null;
  /** Columns the customer's file carries that the TMS has no field for — display-only (see `trips`). */
  customerFields: Record<string, string> | null;
  /** The operation's own annotations (solicitação, checklist, SM Raster, CT-e, doca). */
  operationalFields: Record<string, string> | null;
  /**
   * The other legs of the same customer programming (milk run), newest-leg-last and EXCLUDING this
   * trip. Empty for the ordinary one-leg trip, which is almost all of them.
   */
  siblingLegs: {
    id: string;
    legNumber: number;
    originCode: string;
    destinationCode: string;
    plannedPickupWindowStart: string | null;
    currentStatus: TripStatus;
  }[];
};

/** Um recorte de "viagens por status" de uma região, num dia. */
export interface RegionSlice {
  region: string | null;
  byStatus: { status: TripDisplayStatus; count: number }[];
}

export interface DashboardSummary {
  tripsTodayByStatus: { status: TripDisplayStatus; count: number }[];
  /**
   * As viagens de AMANHÃ por status (2026-08-17, a pedido).
   *
   * O painel fica numa TV no meio da sala, e quem passa por ela de tarde não está resolvendo hoje —
   * está montando amanhã. "Hoje" responde o que está acontecendo; "amanhã" responde o que ainda dá
   * tempo de arrumar, que é onde a operação consegue agir.
   */
  tripsTomorrowByStatus: { status: TripDisplayStatus; count: number }[];
  /**
   * As viagens DO MÊS por status (2026-08-17).
   *
   * Nasceu sem recorte de data e virou mensal no mesmo dia, a pedido — e o pedido está certo. Com o
   * histórico do portal dentro, "todas" passou a somar 30 dias de operação encerrada: um número que
   * cresce para sempre e não muda decisão de ninguém. O mês é o ciclo em que a operação e o
   * faturamento realmente pensam.
   */
  tripsByStatus: { status: TripDisplayStatus; count: number }[];

  /**
   * As viagens de HOJE por REGIÃO da estação de origem (2026-08-20, a pedido).
   *
   * Mesma pergunta do cartão de hoje, recortada por onde a viagem começa. A operação é dividida em
   * três frentes — NONE (Norte + Nordeste), SUDESTE e SULCO (Sul + Centro-Oeste) — e quem cuida de
   * uma delas não consegue ler o número somado: doze viagens em análise não dizem se o problema é
   * seu ou de outra frente.
   *
   * A REGIÃO É A DA ORIGEM, e é uma escolha, não um detalhe: um LH liga duas pontas que podem estar
   * em regiões diferentes. A planilha do cliente titula a coluna "ESTAÇÃO ORIGEM", então é de lá
   * que a viagem herda.
   *
   * `region: null` é estação ainda não classificada — aparece como grupo próprio em vez de sumir,
   * porque viagem que não entra em nenhuma frente é justamente o que alguém precisa ver.
   */
  tripsTodayByRegion: RegionSlice[];
  /**
   * As mesmas frentes em D1 e D2 — amanhã e depois de amanhã (2026-08-20, a pedido).
   *
   * Hoje responde o que está acontecendo; D1 e D2 respondem o que ainda dá tempo de arrumar. Numa TV
   * no meio da sala, de tarde, ninguém mais monta o dia de hoje — monta os próximos.
   */
  tripsD1ByRegion: RegionSlice[];
  tripsD2ByRegion: RegionSlice[];
  /**
   * As LH ATRASADAS por frente: sem motorista e com o prazo vencido (2026-08-20, a pedido).
   *
   * ACUMULA os dias anteriores. Uma viagem de ontem que ninguém atribuiu continua contando aqui até
   * ser resolvida — ela não pertence a nenhum dos três cartões de dia, e sumir do painel é o pior
   * desfecho possível para o caso mais grave.
   */
  lateToAssignByRegion: { region: string | null; count: number }[];
  /**
   * QUEM JÁ DEVIA TER CAMINHÃO NA ORIGEM E NÃO TEM (2026-08-22, a pedido).
   *
   * Vizinho de `lateToAssignByRegion` e diferente dele: aquele é "ninguém foi escalado", este é
   * "foi escalado e não chegou". São duas falhas distintas, com ações distintas — atribuir contra
   * ligar para o motorista —, e somá-las esconderia qual das duas está acontecendo.
   */
  origemAtrasadaByRegion: { region: string | null; count: number }[];
  /** O leilão de spot da frente nas últimas 24h: o que a empresa pegou e o que passou. */
  spotByRegion: { region: string | null; aceito: number; naoAceito: number }[];
  /**
   * A fila do DESPACHO: aceita pelo cliente e ainda sem motorista no portal (2026-08-17).
   *
   * É decisão de GENTE, não estado de caminhão — por isso vem antes dos quadros de status. Nasceu
   * junto com a fila de aceitação; esta última saiu do painel a pedido, porque aceitar ou recusar
   * proposta não é trabalho desta operação, e um número que ninguém aciona é ruído numa TV.
   */
  awaitingAssignment: number;
  billingPendingCount: number;
  tripsAtRisk: number | null;
  unassignedTrips: number | null;
  activeExceptions: number | null;
  onTimePickupPct: number | null;
  onTimeArrivalPct: number | null;
  completedMissingDocuments: number | null;
}

// ---------------------------------------------------------------------------
// Feature 007 — Exception Management / reason-code / SLA-rule read shapes
// ---------------------------------------------------------------------------

export interface ExceptionListItem {
  id: string;
  tripId: string;
  externalTripId: string | null;
  customerId: string;
  customerName: string | null;
  laneLabel: string | null;
  reasonCodeId: string;
  reasonCode: string;
  category: string;
  reasonLabelPt: string;
  severity: string;
  status: string;
  responsibleParty: string;
  ownerUserId: string;
  ownerName: string | null;
  description: string;
  openedAt: string;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ReasonCodeOption {
  id: string;
  code: string;
  category: string;
  labelPt: string;
  defaultSeverity: string;
  defaultResponsibleParty: string;
  sortOrder: number;
}

export interface CustomerSlaRuleItem {
  id: string;
  customerId: string;
  customerName: string | null;
  laneId: string | null;
  laneLabel: string | null;
  vehicleType: string | null;
  pickupToleranceMinutes: number;
  deliveryToleranceMinutes: number;
  confirmationCutoffMinutes: number;
  atRiskWarningMinutes: number;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Shared joins / filters / sort (board + export use the SAME builder — DRY)
// ---------------------------------------------------------------------------

// Origin and destination both reference `locations`, so each end joins an aliased copy.
const originLoc = alias(locations, "origin_loc");
const destLoc = alias(locations, "dest_loc");
// Feature 006 — the current assignment (`is_current`) + its resource-name tables, LEFT-joined so
// unassigned trips still return a row (`isAssigned=false`). Aliased to avoid clashing with any other
// driver/vehicle/carrier join in a wider query.
const boardAsg = alias(tripAssignments, "board_asg");
const boardDriver = alias(drivers, "board_asg_driver");
const boardVehicle = alias(vehicles, "board_asg_vehicle");
const boardCarrier = alias(carriers, "board_asg_carrier");

/** The select shape that backs `TripBoardRow` (plus `laneId`, used to derive `laneLabel`). */
const boardColumns = {
  id: trips.id,
  externalTripId: trips.externalTripId,
  customerId: trips.customerId,
  customerName: customers.name,
  originCode: originLoc.code,
  originRegion: originLoc.region,
  originName: originLoc.name,
  destinationCode: destLoc.code,
  destinationName: destLoc.name,
  laneId: trips.laneId,
  currentStatus: trips.currentStatus,
  slaStatus: trips.slaStatus,
  slaReasons: trips.slaReasons,
  plannedPickupWindowStart: trips.plannedPickupWindowStart,
  plannedPickupWindowEnd: trips.plannedPickupWindowEnd,
  plannedDeliveryWindowStart: trips.plannedDeliveryWindowStart,
  plannedDeliveryWindowEnd: trips.plannedDeliveryWindowEnd,
  plannedVehicleType: trips.plannedVehicleType,
  updatedAt: trips.updatedAt,
  portalAcceptance: sql<string | null>`(${trips.customerFields} ->> 'Aceitação (portal)')`,
  /**
   * QUEM O PORTAL TEM ESCALADO nesta viagem — não quem o TMS atribuiu (2026-08-22).
   *
   * Serve para o formulário de EDIÇÃO abrir preenchido, como o do portal abre. Sem isso, trocar só
   * o motorista obrigaria a redigitar a placa, e redigitar é onde o erro entra.
   */
  portalDriverId: sql<string | null>`(${trips.customerFields} ->> 'ID do motorista (portal)')`,
  portalDriverName: sql<string | null>`(${trips.customerFields} ->> 'Motorista (portal)')`,
  portalPlate: sql<string | null>`(${trips.customerFields} ->> 'Placa (portal)')`,
  portalStatus: sql<string | null>`(${trips.customerFields} ->> 'Status (portal)')`,
  assignmentId: boardAsg.id,
  assignedDriverName: boardDriver.name,
  assignedVehiclePlate: boardVehicle.plate,
  assignedCarrierName: boardCarrier.name,
};

type BoardRow = {
  id: string;
  externalTripId: string | null;
  portalAcceptance: string | null;
  portalDriverId: string | null;
  portalDriverName: string | null;
  portalPlate: string | null;
  portalStatus: string | null;
  customerId: string;
  customerName: string | null;
  originCode: string | null;
  originName: string | null;
  originRegion: string | null;
  destinationCode: string | null;
  destinationName: string | null;
  laneId: string | null;
  currentStatus: TripStatus;
  slaStatus: string | null;
  slaReasons: string[] | null;
  plannedPickupWindowStart: Date | null;
  plannedPickupWindowEnd: Date | null;
  plannedDeliveryWindowStart: Date | null;
  plannedDeliveryWindowEnd: Date | null;
  plannedVehicleType: string | null;
  updatedAt: Date;
  assignmentId: string | null;
  assignedDriverName: string | null;
  assignedVehiclePlate: string | null;
  assignedCarrierName: string | null;
};

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** Map a joined board row to the public `TripBoardRow` (DRY — board + export share it). */
function toBoardRow(row: BoardRow): TripBoardRow {
  return {
    id: row.id,
    externalTripId: row.externalTripId,
    customerId: row.customerId,
    customerName: row.customerName ?? "",
    originCode: row.originCode ?? "",
    originName: row.originName ?? "",
    originRegion: row.originRegion ?? null,
    destinationCode: row.destinationCode ?? "",
    destinationName: row.destinationName ?? "",
    laneLabel: row.laneId ? `${row.originCode ?? ""} → ${row.destinationCode ?? ""}` : null,
    currentStatus: row.currentStatus,
    billingStatus: billingStatus(row.currentStatus),
    slaStatus: row.slaStatus,
    slaReasons: row.slaReasons,
    plannedPickupWindowStart: iso(row.plannedPickupWindowStart),
    plannedPickupWindowEnd: iso(row.plannedPickupWindowEnd),
    plannedDeliveryWindowStart: iso(row.plannedDeliveryWindowStart),
    plannedDeliveryWindowEnd: iso(row.plannedDeliveryWindowEnd),
    plannedVehicleType: row.plannedVehicleType,
    updatedAt: row.updatedAt.toISOString(),
    portalAcceptance: row.portalAcceptance ?? null,
    portalDriverId: row.portalDriverId ?? null,
    portalDriverName: row.portalDriverName ?? null,
    portalPlate: row.portalPlate ?? null,
    portalStatus: row.portalStatus ?? null,
    isAssigned: row.assignmentId != null,
    assignedDriverName: row.assignedDriverName,
    assignedVehiclePlate: row.assignedVehiclePlate,
    assignedCarrierName: row.assignedCarrierName,
  };
}

/**
 * A fila do DESPACHO: o cliente já aceitou a proposta e ainda não há motorista no portal.
 *
 * Fica num só lugar porque o número aparece em dois — o cartão do painel conta, o quadro filtra — e
 * duas escritas do mesmo predicado divergem no primeiro ajuste. Um cartão que abre uma lista com
 * outro total destrói a confiança no painel inteiro, e o erro não se anuncia: os dois números
 * parecem certos, cada um na sua tela.
 *
 * Note que isto NÃO é `assigned=false`. Aquele filtro pergunta se o TMS tem atribuição; este
 * pergunta se o PORTAL tem motorista. São perguntas diferentes e os totais divergem de propósito —
 * uma viagem pode ter motorista no portal e ainda não ter sido espelhada aqui.
 */
export function awaitingAssignmentSql(): SQL<boolean> {
  return sql<boolean>`(
    (${trips.customerFields} ->> 'Aceitação (portal)') = 'Accepted'
    AND (${trips.customerFields} ->> 'Motorista (portal)') IS NULL
  )`;
}

/**
 * Feature 008 — the "trip is missing a required-for-billing proof document" predicate (R13, COV-001),
 * as a reusable boolean SQL fragment over the `trips` table. True when EITHER (a) an applicable active
 * `required_for_billing` requirement (unscoped OR matching lane/vehicle-type) lacks an accepted-or-
 * waived document, OR (b) the customer has NO explicit checklist at all and the DEFAULT (`pod`
 * required-for-billing) is unmet. Used by the dashboard metric, the "Missing documents" board filter,
 * and the billing-list missing-proof indicator.
 */
const DEFAULT_BILLING_DOC_CODE = "pod"; // mirrors DEFAULT_DOCUMENT_CHECKLIST in @brazil-tms/shared

// Exported (009) so the billing-readiness report reuses the EXACT 008 missing-proof predicate
// (DRY-for-correctness) rather than re-deriving the "completed but missing documents" signal.
export function missingBillingDocumentsSql(): SQL<boolean> {
  return sql<boolean>`(
    EXISTS (
      SELECT 1 FROM ${documentRequirements} dr
      WHERE dr.customer_id = ${trips.customerId}
        AND dr.active
        AND dr.required_for_billing
        AND (dr.lane_id IS NULL OR dr.lane_id = ${trips.laneId})
        AND (dr.vehicle_type IS NULL OR dr.vehicle_type = ${trips.plannedVehicleType})
        AND NOT EXISTS (
          SELECT 1 FROM ${documents} d
          WHERE d.trip_id = ${trips.id}
            AND d.document_type_id = dr.document_type_id
            AND d.archived_at IS NULL
            AND (d.verification_status = 'accepted' OR d.waived_at IS NOT NULL)
        )
    )
    OR (
      NOT EXISTS (
        SELECT 1 FROM ${documentRequirements} dr2
        WHERE dr2.customer_id = ${trips.customerId} AND dr2.active
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${documents} d2
        JOIN ${documentTypes} dt ON dt.id = d2.document_type_id AND dt.code = ${DEFAULT_BILLING_DOC_CODE}
        WHERE d2.trip_id = ${trips.id}
          AND d2.archived_at IS NULL
          AND (d2.verification_status = 'accepted' OR d2.waived_at IS NOT NULL)
      )
    )
  )`;
}

/**
 * Build the `WHERE` from a board/export query. Filters compose with AND; the status constraint
 * applies AT MOST one of: explicit `status` list, `billingStatus` projection, the 008
 * `missingDocuments` (billing-phase) view, or the implicit `scope=active` default.
 */
function buildWhere(query: TripBoardQuery | TripExportQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.customerId) conditions.push(eq(trips.customerId, query.customerId));

  // Filters compose with AND: an explicit `status` list and a `billingStatus` projection BOTH
  // constrain current_status (their intersection — a contradictory pair yields no rows). The
  // active-scope default applies ONLY when neither explicit status filter is present.
  if (query.status?.length) {
    conditions.push(inArray(trips.currentStatus, query.status));
  }
  if (query.billingStatus) {
    conditions.push(
      inArray(trips.currentStatus, [...billingStatusToStatuses(query.billingStatus)]),
    );
  }
  // Feature 008 — the "Missing documents" view: billing-phase trips with an unmet required-for-billing
  // document. This itself constrains current_status, so (like status/billingStatus) it suppresses the
  // active-scope default below.
  if (query.missingDocuments === "true") {
    conditions.push(inArray(trips.currentStatus, [...BILLING_PHASE_STATUSES]));
    conditions.push(missingBillingDocumentsSql());
  }
  if (
    !query.status?.length &&
    !query.billingStatus &&
    query.missingDocuments !== "true" &&
    query.scope === "active"
  ) {
    conditions.push(inArray(trips.currentStatus, [...ACTIVE_TRIP_STATUSES]));
  }

  if (query.originLocationId) conditions.push(eq(trips.originLocationId, query.originLocationId));
  /**
   * REGIÃO por SUBCONSULTA, e não por join.
   *
   * As condições daqui alimentam DUAS consultas — a lista e a contagem — e só a lista junta a
   * tabela de locais. Um `eq(originLoc.region, ...)` quebraria a contagem, e fazer a contagem juntar
   * também custaria um join em toda paginação para um filtro que quase nunca está ligado.
   *
   * É o mesmo recorte que os cartões de região do painel contam: o cartão abre esta lista, e os dois
   * números têm que ser o mesmo número.
   */
  if (query.region) {
    conditions.push(
      inArray(
        trips.originLocationId,
        db.select({ id: locations.id }).from(locations).where(eq(locations.region, query.region)),
      ),
    );
  }
  if (query.destinationLocationId) {
    conditions.push(eq(trips.destinationLocationId, query.destinationLocationId));
  }
  if (query.laneId) conditions.push(eq(trips.laneId, query.laneId));
  if (query.vehicleType) {
    conditions.push(eq(trips.plannedVehicleType, query.vehicleType));
  }

  // Feature 007 — SLA-risk filters (data-model §12). `slaStatus` narrows to specific risk states;
  // `atRisk=true` is the union (at_risk|late|breached) backing the "At risk" view.
  if (query.slaStatus?.length) {
    conditions.push(inArray(trips.slaStatus, query.slaStatus));
  }
  if (query.atRisk === "true") {
    conditions.push(inArray(trips.slaStatus, ["at_risk", "late", "breached"]));
  }

  /**
   * As duas faixas vermelhas do cartão da frente, como filtro do quadro (2026-08-23).
   *
   * Existem para o clique na faixa abrir EXATAMENTE as viagens que ela contou. Antes o atalho
   * mandava a fila inteira do dia, e aí o cartão dizia 16 e a lista mostrava outra coisa — erro em
   * que nenhum dos dois lados parece errado sozinho. Nenhum dos dois tem botão na barra de
   * filtros: são destinos de atalho, e a barra já tem o que se usa digitando.
   */
  if (query.lateToAssign === "true") conditions.push(lateToAssignSql());
  if (query.origemAtrasada === "true") conditions.push(origemAtrasadaSql());
  // A fila do despacho — o MESMO predicado que o cartão do painel conta. Ver `awaitingAssignmentSql`.
  if (query.awaitingAssignment === "true") {
    conditions.push(inArray(trips.currentStatus, [...ACTIVE_TRIP_STATUSES]));
    conditions.push(awaitingAssignmentSql());
  }
  /**
   * As duas metades do que era "Recebida" (2026-08-18).
   *
   * `true` = em análise (o cliente não decidiu); `false` = p/atribuir (decidiu, falta motorista). O
   * par é EXAUSTIVO de propósito: juntos cobrem `received` inteiro sem sobreposição, e é isso que
   * permite a ficha do quadro somar exatamente o mesmo total de antes.
   *
   * O `false` precisa ser negação explícita — sem ele, a ficha "P/Atribuir" abriria a lista inteira
   * e mostraria um número diferente do que a própria ficha anuncia.
   */
  // Uma das três filas do que era "Recebida". O predicado vem de `tripQueueSql`, o MESMO que a
  // contagem da ficha usa — escritos separados, a lista e o número que a anuncia divergiriam.
  if (query.queue === "awaiting_arrival") {
    /**
     * "NA ORIGEM" abrange DOIS status reais (2026-08-19): a viagem que o cliente escalou e ainda
     * está em `received`, e a que já chegou e está em `at_origin`. O filtro precisa dizer isso, ou
     * quem clicar no cartão cai numa lista menor que o número que a anunciou — e a discordância
     * entre contagem e lista é justamente o que o resto deste arquivo trabalha para impedir.
     */
    conditions.push(
      or(
        eq(trips.currentStatus, "at_origin"),
        and(eq(trips.currentStatus, "received"), tripQueueSql("awaiting_arrival")),
      )!,
    );
  } else if (query.queue) {
    conditions.push(eq(trips.currentStatus, "received"));
    conditions.push(tripQueueSql(query.queue));
  }

  /**
   * O EIXO DA ACEITAÇÃO SOZINHO — sem dizer nada sobre motorista (2026-08-22).
   *
   * Independente de `queue` de propósito: quem pergunta isto quer a união de "aceita e sem
   * motorista" com "aceita e já com motorista", que nenhum valor de `queue` sabe expressar.
   *
   * `IS DISTINCT FROM` e não `<>`: viagem sem aceitação gravada — digitada à mão, ou anterior a o
   * TMS ler esse campo — conta como não-pendente, que é o que `displayStatusOf` já faz. Com `<>`,
   * o nulo devolveria nulo e ela sumiria da lista sem nunca aparecer em lugar nenhum.
   */
  if (query.portalAccepted) {
    const pendente = sql<boolean>`(${trips.customerFields} ->> 'Aceitação (portal)') IS NOT DISTINCT FROM ${ACEITACAO_PENDENTE}`;
    conditions.push(query.portalAccepted === "true" ? not(pendente) : pendente);
  }

  // Feature 006 — assignment filters (data-model.md §5). These reference the LEFT-joined current
  // assignment (`boardAsg`), so the join is present in BOTH `boardSelect()` and `boardCount()`.
  if (query.assigned === "true") conditions.push(isNotNull(boardAsg.id));
  if (query.assigned === "false") conditions.push(isNull(boardAsg.id));
  if (query.driverId) conditions.push(eq(boardAsg.driverId, query.driverId));
  if (query.vehicleId) conditions.push(eq(boardAsg.vehicleId, query.vehicleId));
  if (query.carrierId) conditions.push(eq(boardAsg.carrierId, query.carrierId));

  // Pickup date range (R6) — São Paulo day boundaries mapped to UTC instants.
  if (query.pickupFrom) {
    conditions.push(
      gte(trips.plannedPickupWindowStart, new Date(dayRangeSaoPaulo(query.pickupFrom).from)),
    );
  }
  if (query.pickupTo) {
    conditions.push(
      lt(trips.plannedPickupWindowStart, new Date(dayRangeSaoPaulo(query.pickupTo).to)),
    );
  }

  if (query.q) {
    /**
     * VÁRIAS LHs DE UMA VEZ (2026-08-21, a pedido): colar uma lista na busca filtra todas.
     *
     * A operação recebe LHs em bloco — de uma planilha, de um e-mail, do próprio portal — e antes
     * disso era uma busca por vez, anotando o resultado no papel. Colar e ver a lista inteira é a
     * diferença entre conferir trinta viagens em trinta buscas ou numa.
     *
     * Os termos se somam com OU, nunca com E: quem cola trinta LHs quer as trinta, e E devolveria
     * sempre vazio — nenhuma viagem é trinta viagens ao mesmo tempo.
     *
     * Um termo só continua se comportando como antes, inclusive buscando por cliente e por estação.
     * Com vários, a busca por nome perde o sentido (ninguém cola uma lista de nomes de cliente) mas
     * também não atrapalha — e manter o MESMO predicado evita duas buscas que se comportam
     * diferente sem que ninguém saiba por quê.
     */
    const termos = termosDaBusca(query.q);
    const search = or(
      ...termos.flatMap((termo) => {
        const like = `%${termo}%`;
        return [
          ilike(trips.externalTripId, like),
          ilike(customers.name, like),
          ilike(originLoc.name, like),
          ilike(destLoc.name, like),
          ilike(originLoc.code, like),
          ilike(destLoc.code, like),
        ];
      }),
    );
    if (search) conditions.push(search);
  }

  return conditions.length ? and(...conditions) : undefined;
}

/** Map the validated `sort`/`dir` onto the ORDER BY column expression. */
function buildOrderBy(query: TripBoardQuery | TripExportQuery): SQL {
  const columns: Record<TripBoardQuery["sort"], SQLWrapper> = {
    pickupStart: trips.plannedPickupWindowStart,
    customer: customers.name,
    status: trips.currentStatus,
    createdAt: trips.createdAt,
    updatedAt: trips.updatedAt,
  };
  const col = columns[query.sort];
  return query.dir === "desc" ? desc(col) : asc(col);
}

/**
 * A board/export base select with the customer + aliased origin/destination joins, plus the 006
 * current-assignment join (`is_current`) and its driver/vehicle/carrier name tables. The assignment
 * join is `ON board_asg.trip_id = trips.id AND board_asg.is_current` so unassigned trips still return
 * a row (LEFT JOIN); the partial-unique index guarantees at most one current row per trip.
 */
function boardSelect() {
  return db
    .select(boardColumns)
    .from(trips)
    .leftJoin(customers, eq(trips.customerId, customers.id))
    .leftJoin(originLoc, eq(trips.originLocationId, originLoc.id))
    .leftJoin(destLoc, eq(trips.destinationLocationId, destLoc.id))
    .leftJoin(boardAsg, and(eq(boardAsg.tripId, trips.id), eq(boardAsg.isCurrent, true)))
    .leftJoin(boardDriver, eq(boardAsg.driverId, boardDriver.id))
    .leftJoin(boardVehicle, eq(boardAsg.vehicleId, boardVehicle.id))
    .leftJoin(boardCarrier, eq(boardAsg.carrierId, boardCarrier.id));
}

/**
 * The same joins, grouped by `current_status` — one row per status present under the CURRENT filters
 * (customer, lane, date range, search…) with the status filter itself removed and the active-scope
 * default suppressed. That is exactly the set `buildWhere` produces when a status chip is clicked (an
 * explicit `status` list suppresses the active default), so each chip's number is a promise: click me
 * and you get this many rows. Statuses with no rows are simply absent from the result.
 */
/**
 * O status COMO A TELA CHAMA — `received` desdobrado pelo eixo da aceitação (2026-08-18).
 *
 * "Recebida" descrevia o TMS e escondia duas filas que pedem coisas diferentes de pessoas
 * diferentes: 63 esperando alguém aceitar contra 326 esperando alguém escalar motorista. O quadro e
 * o painel contam por ESTE valor, não pelo status cru, senão a ficha diria um número e as linhas
 * dela diriam outro.
 *
 * A regra vive em `displayStatusOf` (shared, sob teste) e aqui em SQL. São duas escritas da mesma
 * regra, e é uma dívida consciente: agrupar no banco é a única forma de contar sem trazer a tabela
 * inteira para a memória. O teste de contrato entre as duas é o que impede a divergência.
 */
/**
 * O DIA DA COLETA no fuso de São Paulo, como texto `YYYY-MM-DD`.
 *
 * Duas decisões apertadas aqui, e as duas já morderam este arquivo:
 *
 * TABELA QUALIFICADA à mão. Na projeção de um SELECT o Drizzle escreve a coluna sem o nome da
 * tabela, e numa consulta com join isso é uma ambiguidade esperando acontecer.
 *
 * FUSO COMO LITERAL, não como parâmetro. Esta mesma expressão aparece no SELECT e no GROUP BY; se o
 * fuso viajasse como `$1` e `$2`, o Postgres veria duas expressões DIFERENTES e recusaria a consulta
 * com "column must appear in the GROUP BY clause". O valor é constante nossa, não entrada de usuário.
 */
const diaColetaSaoPaulo = sql<string>`(${trips}.planned_pickup_window_start AT TIME ZONE ${sql.raw(
  `'${APP_TIME_ZONE}'`,
)})::date`;

const displayStatusSql = sql<string>`CASE
  -- "NA ORIGEM" e UMA linha so: a fila do portal e a chegada de verdade (2026-08-19, a pedido).
  -- Espelha displayStatusOf; se as duas divergirem, o cartao e a lista mostram numeros diferentes
  -- para a mesma pergunta e nenhum dos dois parece errado sozinho.
  WHEN ${trips.currentStatus} = 'at_origin' THEN 'awaiting_arrival'
  WHEN ${trips.currentStatus} <> 'received' THEN ${trips.currentStatus}::text
  WHEN (${trips.customerFields} ->> 'Status (portal)') = 'Assigned' THEN 'awaiting_arrival'
  WHEN (${trips.customerFields} ->> 'Aceitação (portal)') = 'Pending' THEN 'in_analysis'
  ELSE 'to_assign'
END`;

function boardStatusCounts(where: SQL | undefined) {
  return db
    .select({ status: displayStatusSql, value: count() })
    .from(trips)
    .leftJoin(customers, eq(trips.customerId, customers.id))
    .leftJoin(originLoc, eq(trips.originLocationId, originLoc.id))
    .leftJoin(destLoc, eq(trips.destinationLocationId, destLoc.id))
    .leftJoin(boardAsg, and(eq(boardAsg.tripId, trips.id), eq(boardAsg.isCurrent, true)))
    .leftJoin(boardDriver, eq(boardAsg.driverId, boardDriver.id))
    .leftJoin(boardVehicle, eq(boardAsg.vehicleId, boardVehicle.id))
    .leftJoin(boardCarrier, eq(boardAsg.carrierId, boardCarrier.id))
    .where(where)
    .groupBy(displayStatusSql);
}

/** A `count()` over the same joins (the where/q references the joined names + current assignment). */
function boardCount(where: SQL | undefined) {
  return db
    .select({ value: count() })
    .from(trips)
    .leftJoin(customers, eq(trips.customerId, customers.id))
    .leftJoin(originLoc, eq(trips.originLocationId, originLoc.id))
    .leftJoin(destLoc, eq(trips.destinationLocationId, destLoc.id))
    .leftJoin(boardAsg, and(eq(boardAsg.tripId, trips.id), eq(boardAsg.isCurrent, true)))
    .leftJoin(boardDriver, eq(boardAsg.driverId, boardDriver.id))
    .leftJoin(boardVehicle, eq(boardAsg.vehicleId, boardVehicle.id))
    .leftJoin(boardCarrier, eq(boardAsg.carrierId, boardCarrier.id))
    .where(where);
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

/**
 * The Control Tower board (R2/R3/R6): server-side filter + whitelist sort + pagination. Returns the
 * page rows and the FULL match `total` (independent of limit/offset). The page query and the count
 * run concurrently.
 */
export async function queryTripBoard(query: TripBoardQuery): Promise<TripBoardResult> {
  const where = buildWhere(query);
  const orderBy = buildOrderBy(query);

  // The facet where-clause drops the status filter (a chip must count itself, not be counted through
  // itself) and pins the scope to `all` (the active default would zero every closed status, hiding
  // the very rows the chip exists to reach).
  const facetWhere = buildWhere({ ...query, status: undefined, scope: "all" });

  const [rows, totalRows, statusRows] = await Promise.all([
    boardSelect().where(where).orderBy(orderBy).limit(query.limit).offset(query.offset),
    boardCount(where),
    boardStatusCounts(facetWhere),
  ]);

  // O agrupamento vem do SQL como texto; o conjunto possível é o de `displayStatusSql`, e o teste
  // de contrato entre ele e `displayStatusOf` é quem garante que não apareça uma chave inventada.
  const statusCounts: Partial<Record<TripDisplayStatus, number>> = {};
  for (const row of statusRows) statusCounts[row.status as TripDisplayStatus] = row.value;

  return {
    rows: rows.map(toBoardRow),
    total: totalRows[0]?.value ?? 0,
    statusCounts,
  };
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

/**
 * The enriched Trip Detail view: 003's full `TripDetail` (events + audit + billing projection) plus
 * the joined customer/location display names, the derived `laneLabel`, and `importBatchId` (which the
 * base `TripDetail` omits). Returns `null` when the trip does not exist (→ 404).
 */
export async function getTripDetailView(id: string): Promise<TripDetailView | null> {
  const detail = await loadTripDetail(db, id);
  if (!detail) return null;

  const enrichment = await db
    .select({
      customerName: customers.name,
      originCode: originLoc.code,
      originName: originLoc.name,
      destinationCode: destLoc.code,
      destinationName: destLoc.name,
      laneId: trips.laneId,
      importBatchId: trips.importBatchId,
      customerFields: trips.customerFields,
      operationalFields: trips.operationalFields,
    })
    .from(trips)
    .leftJoin(customers, eq(trips.customerId, customers.id))
    .leftJoin(originLoc, eq(trips.originLocationId, originLoc.id))
    .leftJoin(destLoc, eq(trips.destinationLocationId, destLoc.id))
    .where(eq(trips.id, id))
    .limit(1);

  const row = enrichment[0];
  if (!row) return null;

  /**
   * A milk run keeps ONE customer id across chained movements, so a trip may have siblings. Looked
   * up only when the trip carries an external id; the query is a cheap index hit on
   * (customer_id, external_trip_id) and returns nothing for the ordinary single-leg trip.
   */
  const siblingLegs = detail.externalTripId
    ? (
        await db
          .select({
            id: trips.id,
            legNumber: trips.legNumber,
            originCode: originLoc.code,
            destinationCode: destLoc.code,
            plannedPickupWindowStart: trips.plannedPickupWindowStart,
            currentStatus: trips.currentStatus,
          })
          .from(trips)
          .leftJoin(originLoc, eq(trips.originLocationId, originLoc.id))
          .leftJoin(destLoc, eq(trips.destinationLocationId, destLoc.id))
          .where(
            and(
              eq(trips.customerId, detail.customerId),
              eq(trips.externalTripId, detail.externalTripId),
            ),
          )
          .orderBy(asc(trips.legNumber))
      )
        .filter((leg) => leg.id !== id)
        .map((leg) => ({
          id: leg.id,
          legNumber: leg.legNumber,
          originCode: leg.originCode ?? "",
          destinationCode: leg.destinationCode ?? "",
          plannedPickupWindowStart: leg.plannedPickupWindowStart
            ? leg.plannedPickupWindowStart.toISOString()
            : null,
          currentStatus: leg.currentStatus,
        }))
    : [];

  return {
    ...detail,
    siblingLegs,
    customerName: row.customerName ?? "",
    originCode: row.originCode ?? "",
    originName: row.originName ?? "",
    destinationCode: row.destinationCode ?? "",
    destinationName: row.destinationName ?? "",
    laneLabel: row.laneId ? `${row.originCode ?? ""} → ${row.destinationCode ?? ""}` : null,
    importBatchId: row.importBatchId,
    customerFields: (row.customerFields as Record<string, string> | null) ?? null,
    operationalFields: (row.operationalFields as Record<string, string> | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Daily dashboard
// ---------------------------------------------------------------------------

/**
 * The Home daily-dashboard counts (R7). `tripsTodayByStatus` groups trips whose planned pickup falls
 * inside the current São Paulo day; `billingPendingCount` is the live `billing_pending` count;
 * `unassignedTrips` (006) counts ACTIVE trips with no current assignment. Every later-slice metric
 * (SLA risk → 007, exceptions/on-time → 007, missing docs → 008) is returned as `null` — scaffolded,
 * not invented.
 */
/**
 * As linhas de UM dia, dentro do lote de três.
 *
 * A consulta traz os três dias juntos e o corte acontece aqui, em memória — são poucas dezenas de
 * linhas. `inicio` é o começo do dia em UTC (o mesmo `dayRangeSaoPaulo` que o resto do painel usa) e
 * vira `YYYY-MM-DD` no fuso de São Paulo para casar com o que o banco agrupou.
 *
 * Dia sem viagem nenhuma some do resultado do banco, e é isso que se quer: a região não aparece
 * naquele dia em vez de aparecer zerada.
 */
function doDia<T extends { dia: string }>(linhas: T[], inicio: string): T[] {
  const alvo = DateTime.fromISO(inicio, { zone: "utc" }).setZone(APP_TIME_ZONE).toISODate();
  return linhas.filter((l) => l.dia === alvo);
}

/**
 * As linhas (região, status, contagem) viram um grupo por região, na ORDEM DECLARADA.
 *
 * A ordem vem de `REGION_ORDER` e não do banco: um `ORDER BY` alfabético poria NONE antes de
 * SUDESTE hoje e mudaria de lugar no dia em que uma região nova entrasse. Num painel de parede, a
 * posição do cartão é como as pessoas o encontram — ela não pode depender do alfabeto.
 *
 * Região fora da lista (uma quarta que a operação criar sem avisar o código) entra no fim, em vez
 * de sumir: número que existe e não aparece é pior do que número fora de ordem.
 */
function agruparPorRegiao(
  linhas: { region: string | null; status: string; value: number }[],
): DashboardSummary["tripsTodayByRegion"] {
  const grupos = new Map<string | null, { status: TripDisplayStatus; count: number }[]>();
  for (const l of linhas) {
    const chave = l.region && l.region.trim() !== "" ? l.region : null;
    const lista = grupos.get(chave) ?? [];
    lista.push({ status: l.status as TripDisplayStatus, count: l.value });
    grupos.set(chave, lista);
  }

  return [...grupos.entries()]
    .sort(([a], [b]) => regionPosition(a) - regionPosition(b) || String(a).localeCompare(String(b)))
    .map(([region, byStatus]) => ({ region, byStatus }));
}
export async function queryDashboardMetrics(): Promise<DashboardSummary> {
  const agora = new Date();
  const { from, to } = dayRangeSaoPaulo(agora);
  const amanha = dayRangeSaoPaulo(agora, 1);
  // D2 fecha a janela dos cartões por região: hoje, amanhã e depois de amanhã.
  const depois = dayRangeSaoPaulo(agora, 2);
  const mes = monthRangeSaoPaulo(agora);
  // 009 — the shared on-time predicate (R2): one source of truth with the SLA report.
  const pickup = onTimeExpr("pickup");
  const arrival = onTimeExpr("arrival");

  const [
    byStatus,
    porRegiaoTresDias,
    atrasadasPorRegiao,
    byStatusAmanha,
    allByStatus,
    aguardandoAtribuicao,
    billingPending,
    unassigned,
    atRisk,
    activeExc,
    pickupPct,
    arrivalPct,
    missingDocs,
    origemAtrasada,
    spot,
  ] = await Promise.all([
    db
      .select({ status: displayStatusSql, value: count() })
      .from(trips)
      .where(
        and(
          gte(trips.plannedPickupWindowStart, new Date(from)),
          lt(trips.plannedPickupWindowStart, new Date(to)),
        ),
      )
      .groupBy(displayStatusSql),
    /**
     * TRÊS DIAS, quebrados por região da estação de ORIGEM — hoje, D1 e D2 (2026-08-20, a pedido).
     *
     * UMA consulta para os três, e não três. O agrupamento por dia já existe no banco; repetir a
     * mesma varredura três vezes só para mudar a janela custaria três idas ao Postgres a cada
     * atualização do painel, que roda de minuto em minuto numa TV.
     *
     * `innerJoin` e não `leftJoin`: toda viagem tem origem obrigatória (a coluna é `notNull`), então
     * não há linha a perder. O que pode faltar é a REGIÃO da estação, e essa vem nula — agrupada
     * como um grupo próprio, não descartada.
     *
     * O dia sai do fuso de SÃO PAULO, não do UTC: uma coleta às 22h de Brasília é 01h do dia
     * seguinte em UTC, e cairia no cartão errado — justamente nas viagens noturnas, que são as que
     * mais interessam a quem monta o dia seguinte.
     */
    db
      .select({
        dia: sql<string>`${diaColetaSaoPaulo}::text`,
        region: locations.region,
        status: displayStatusSql,
        value: count(),
      })
      .from(trips)
      .innerJoin(locations, eq(locations.id, trips.originLocationId))
      .where(
        and(
          gte(trips.plannedPickupWindowStart, new Date(from)),
          lt(trips.plannedPickupWindowStart, new Date(depois.to)),
        ),
      )
      .groupBy(diaColetaSaoPaulo, locations.region, displayStatusSql),
    /**
     * As ATRASADAS por frente, sem recorte de data: o prazo é que define, não o dia.
     *
     * A regra mora em `lateToAssignSql` — inclusive o conserto de 2026-08-23, quando ela deixou
     * de contar só `to_assign` e passou a contar também `in_analysis`. O predicado é o MESMO que
     * o filtro `lateToAssign=true` do quadro usa, para o número daqui e o total de lá não
     * divergirem.
     */
    db
      .select({ region: locations.region, value: count() })
      .from(trips)
      .innerJoin(locations, eq(locations.id, trips.originLocationId))
      .where(lateToAssignSql())
      .groupBy(locations.region),
    // O mesmo recorte, no dia SEGUINTE — o que ainda dá tempo de arrumar.
    db
      .select({ status: displayStatusSql, value: count() })
      .from(trips)
      .where(
        and(
          gte(trips.plannedPickupWindowStart, new Date(amanha.from)),
          lt(trips.plannedPickupWindowStart, new Date(amanha.to)),
        ),
      )
      .groupBy(displayStatusSql),
    // O mesmo recorte, no MÊS corrente — o ciclo em que a operação e o faturamento pensam.
    db
      .select({ status: displayStatusSql, value: count() })
      .from(trips)
      .where(
        and(
          gte(trips.plannedPickupWindowStart, new Date(mes.from)),
          lt(trips.plannedPickupWindowStart, new Date(mes.to)),
        ),
      )
      .groupBy(displayStatusSql),
    /**
     * Aceitas e esperando ATRIBUIÇÃO: o cliente já disse sim e ainda não há motorista. É a fila do
     * despacho — 359 no portal quando foi medida.
     *
     * O predicado vem de `awaitingAssignmentSql`, o MESMO que o filtro do quadro usa, porque este
     * número tem um atalho que abre aquela lista. Escrito duas vezes, o cartão e a lista divergiriam
     * sem que nenhum dos dois parecesse errado.
     */
    db
      .select({ value: count() })
      .from(trips)
      .where(and(inArray(trips.currentStatus, [...ACTIVE_TRIP_STATUSES]), awaitingAssignmentSql())),
    db.select({ value: count() }).from(trips).where(eq(trips.currentStatus, "billing_pending")),
    // Active trips with NO current assignment (006 — fills the "unassigned trips" widget).
    db
      .select({ value: count() })
      .from(trips)
      .where(
        and(
          inArray(trips.currentStatus, [...ACTIVE_TRIP_STATUSES]),
          sql`NOT EXISTS (
              SELECT 1 FROM ${tripAssignments}
              WHERE ${tripAssignments.tripId} = ${trips.id} AND ${tripAssignments.isCurrent}
            )`,
        ),
      ),
    // Feature 007 — active trips at SLA risk (at_risk|late|breached); terminal stale values excluded.
    db
      .select({ value: count() })
      .from(trips)
      .where(
        and(
          inArray(trips.currentStatus, [...ACTIVE_TRIP_STATUSES]),
          inArray(trips.slaStatus, ["at_risk", "late", "breached"]),
        ),
      ),
    // Feature 007 — open/monitoring exceptions across all trips.
    db
      .select({ value: count() })
      .from(exceptions)
      .where(inArray(exceptions.status, ["open", "monitoring"])),
    // Feature 007/009 — on-time pickup %: trips (planned pickup in the last 30 days, window known)
    // that recorded an origin arrival within the planned pickup window. NULL when no denominator yet.
    // Sourced from the shared `onTimeExpr` (DRY-for-correctness, R2) — behavior-preserving: same
    // denom/num the inline CTE produced, now from the single predicate the SLA report also uses.
    db
      .select({
        denom: sql<number>`count(*) FILTER (WHERE ${pickup.actualRecorded})::int`,
        num: sql<number>`count(*) FILTER (WHERE ${pickup.onTime})::int`,
      })
      .from(trips)
      .where(
        and(
          isNotNull(trips.plannedPickupWindowEnd),
          gte(trips.plannedPickupWindowStart, sql`now() - interval '30 days'`),
        ),
      ),
    // Feature 007/009 — on-time arrival %: same, for destination arrival vs the planned delivery window.
    db
      .select({
        denom: sql<number>`count(*) FILTER (WHERE ${arrival.actualRecorded})::int`,
        num: sql<number>`count(*) FILTER (WHERE ${arrival.onTime})::int`,
      })
      .from(trips)
      .where(
        and(
          isNotNull(trips.plannedDeliveryWindowEnd),
          gte(trips.plannedPickupWindowStart, sql`now() - interval '30 days'`),
        ),
      ),
    // Feature 008 — billing-phase trips with ≥1 unmet required-for-billing document (R13, COV-001).
    db
      .select({ value: count() })
      .from(trips)
      .where(
        and(
          inArray(trips.currentStatus, [...BILLING_PHASE_STATUSES]),
          missingBillingDocumentsSql(),
        ),
      ),
    /**
     * Os dois recortes que faltavam no cartão da região, vindos de `programacao.ts`.
     *
     * Entram AQUI, na mesma rajada, e não numa chamada depois: o painel é uma tela só, e uma
     * leitura em série faria metade dos números envelhecer esperando a outra metade.
     */
    readOrigemAtrasadaPorRegiao(),
    readSpotPorRegiao(),
  ]);

  const pct = (rows: Array<{ denom: number; num: number }>): number | null => {
    const r = rows[0];
    const denom = Number(r?.denom ?? 0);
    const num = Number(r?.num ?? 0);
    return denom > 0 ? Math.round((num / denom) * 100) : null;
  };

  return {
    tripsTodayByStatus: byStatus.map((r) => ({
      status: r.status as TripDisplayStatus,
      count: r.value,
    })),
    tripsTodayByRegion: agruparPorRegiao(doDia(porRegiaoTresDias, from)),
    tripsD1ByRegion: agruparPorRegiao(doDia(porRegiaoTresDias, amanha.from)),
    tripsD2ByRegion: agruparPorRegiao(doDia(porRegiaoTresDias, depois.from)),
    lateToAssignByRegion: atrasadasPorRegiao
      .map((r) => ({ region: r.region ?? null, count: r.value }))
      .sort((a, b) => regionPosition(a.region) - regionPosition(b.region)),
    origemAtrasadaByRegion: origemAtrasada,
    spotByRegion: spot,
    tripsTomorrowByStatus: byStatusAmanha.map((r) => ({
      status: r.status as TripDisplayStatus,
      count: r.value,
    })),
    tripsByStatus: allByStatus.map((r) => ({
      status: r.status as TripDisplayStatus,
      count: r.value,
    })),
    awaitingAssignment: aguardandoAtribuicao[0]?.value ?? 0,
    billingPendingCount: billingPending[0]?.value ?? 0,
    tripsAtRisk: atRisk[0]?.value ?? 0,
    unassignedTrips: unassigned[0]?.value ?? 0,
    activeExceptions: activeExc[0]?.value ?? 0,
    onTimePickupPct: pct(pickupPct),
    onTimeArrivalPct: pct(arrivalPct),
    completedMissingDocuments: missingDocs[0]?.value ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Capped synchronous export
// ---------------------------------------------------------------------------

/**
 * The synchronous CSV export rows (R13): the SAME board filters + sort, WITHOUT pagination. The match
 * count is checked against `cap` first; exceeding it throws `409 EXPORT_TOO_LARGE` so the caller can
 * tell the operator to narrow the filters rather than streaming an unbounded result.
 */
export async function exportTripRows(
  query: TripExportQuery,
  cap = EXPORT_ROW_CAP,
): Promise<TripBoardRow[]> {
  const where = buildWhere(query);

  const totalRows = await boardCount(where);
  const total = totalRows[0]?.value ?? 0;
  if (total > cap) {
    throw new Conflict("EXPORT_TOO_LARGE", `O resultado excede ${cap} linhas.`);
  }

  const rows = await boardSelect().where(where).orderBy(buildOrderBy(query));
  return rows.map(toBoardRow);
}

// ---------------------------------------------------------------------------
// Filter option lookups (board dropdowns)
// ---------------------------------------------------------------------------

/** A minimal resource option for the assignment pickers / dispatch filters (006). */
export interface ResourceOption {
  id: string;
  label: string;
}

export interface TripFilterOptions {
  customers: { id: string; name: string }[];
  locations: { id: string; code: string; name: string }[];
  lanes: {
    id: string;
    customerId: string;
    originLocationId: string;
    destinationLocationId: string;
  }[];
  // Feature 006 — the active fleet lists the assignment pickers / dispatch filters select from
  // (data-model.md §5). NON-ARCHIVED only — NOT filtered by status, so a dispatcher can still pick a
  // resource that will only WARN. `label` = driver name / vehicle plate / trailer plate / carrier name.
  drivers: ResourceOption[];
  vehicles: ResourceOption[];
  trailers: ResourceOption[];
  carriers: ResourceOption[];
  // Feature 007 — option sources for the Exception Management filters (reason codes + exception owners).
  reasonCodes: { id: string; code: string; category: string; labelPt: string }[];
  owners: ResourceOption[];
}

/**
 * The data-backed dropdown options for the Control Tower filters (customers / locations / lanes) and
 * the 006 dispatch pickers (active drivers / vehicles / trailers / carriers), active (non-archived)
 * only. Fetched server-side by the board/detail page loaders (already guarded on `view_all_trips`)
 * and passed down as props, so the dispatch roles do NOT call the `manage_fleet_data`-gated
 * master-data list APIs (the `assign_resources` Dispatcher role lacks `manage_fleet_data` → 403).
 * The fleet lists are non-archived but NOT status-filtered (a dispatcher must be able to pick a
 * resource that will only WARN). Minimal projections only.
 */
export async function getTripFilterOptions(): Promise<TripFilterOptions> {
  const [
    customerRows,
    locationRows,
    laneRows,
    driverRows,
    vehicleRows,
    trailerRows,
    carrierRows,
    reasonCodeRows,
    ownerRows,
  ] = await Promise.all([
    db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(isNull(customers.archivedAt))
      .orderBy(asc(customers.name)),
    db
      .select({ id: locations.id, code: locations.code, name: locations.name })
      .from(locations)
      .where(isNull(locations.archivedAt))
      .orderBy(asc(locations.code)),
    db
      .select({
        id: lanes.id,
        customerId: lanes.customerId,
        originLocationId: lanes.originLocationId,
        destinationLocationId: lanes.destinationLocationId,
      })
      .from(lanes)
      .where(isNull(lanes.archivedAt)),
    db
      .select({ id: drivers.id, label: drivers.name })
      .from(drivers)
      .where(isNull(drivers.archivedAt))
      .orderBy(asc(drivers.name)),
    db
      .select({ id: vehicles.id, label: vehicles.plate })
      .from(vehicles)
      .where(isNull(vehicles.archivedAt))
      .orderBy(asc(vehicles.plate)),
    db
      .select({ id: trailers.id, label: trailers.plate })
      .from(trailers)
      .where(isNull(trailers.archivedAt))
      .orderBy(asc(trailers.plate)),
    db
      .select({ id: carriers.id, label: carriers.name })
      .from(carriers)
      .where(isNull(carriers.archivedAt))
      .orderBy(asc(carriers.name)),
    // Feature 007 — active reason codes + every user who owns an exception (for the queue filters).
    db
      .select({
        id: reasonCodes.id,
        code: reasonCodes.code,
        category: reasonCodes.category,
        labelPt: reasonCodes.labelPt,
      })
      .from(reasonCodes)
      .where(eq(reasonCodes.active, true))
      .orderBy(asc(reasonCodes.sortOrder)),
    db
      .selectDistinct({ id: users.id, label: users.name })
      .from(users)
      .innerJoin(exceptions, eq(exceptions.ownerUserId, users.id))
      .orderBy(asc(users.name)),
  ]);

  return {
    customers: customerRows,
    locations: locationRows,
    lanes: laneRows,
    drivers: driverRows,
    vehicles: vehicleRows,
    trailers: trailerRows,
    carriers: carrierRows,
    reasonCodes: reasonCodeRows,
    owners: ownerRows,
  };
}

// ---------------------------------------------------------------------------
// Feature 007 — Exception Management list / reason codes / SLA rules
// ---------------------------------------------------------------------------

// Origin/destination aliases for the exception list's lane label (reuse the board pattern).
const excOriginLoc = alias(locations, "exc_origin_loc");
const excDestLoc = alias(locations, "exc_dest_loc");
const excOwnerUser = alias(users, "exc_owner_user");

/**
 * The Exception Management list (FR-013): filter by severity / status / customer (via trip) / lane
 * (via trip) / reason code / owner / minimum age (since `opened_at`). The category is DERIVED via the
 * `reason_codes` join (never stored on the exception). Newest-first by `opened_at`, paginated.
 */
export async function queryExceptions(filters: ExceptionFilter): Promise<ExceptionListItem[]> {
  const conditions: SQL[] = [];
  if (filters.severity) conditions.push(eq(exceptions.severity, filters.severity));
  if (filters.status) conditions.push(eq(exceptions.status, filters.status));
  if (filters.customerId) conditions.push(eq(trips.customerId, filters.customerId));
  if (filters.laneId) conditions.push(eq(trips.laneId, filters.laneId));
  if (filters.reasonCodeId) conditions.push(eq(exceptions.reasonCodeId, filters.reasonCodeId));
  if (filters.ownerUserId) conditions.push(eq(exceptions.ownerUserId, filters.ownerUserId));
  if (filters.minAgeHours != null) {
    conditions.push(
      lte(exceptions.openedAt, new Date(Date.now() - filters.minAgeHours * 3_600_000)),
    );
  }

  const rows = await db
    .select({
      id: exceptions.id,
      tripId: exceptions.tripId,
      externalTripId: trips.externalTripId,
      customerId: trips.customerId,
      customerName: customers.name,
      laneId: trips.laneId,
      originCode: excOriginLoc.code,
      destinationCode: excDestLoc.code,
      reasonCodeId: exceptions.reasonCodeId,
      reasonCode: reasonCodes.code,
      category: reasonCodes.category,
      reasonLabelPt: reasonCodes.labelPt,
      severity: exceptions.severity,
      status: exceptions.status,
      responsibleParty: exceptions.responsibleParty,
      ownerUserId: exceptions.ownerUserId,
      ownerName: excOwnerUser.name,
      description: exceptions.description,
      openedAt: exceptions.openedAt,
      resolvedAt: exceptions.resolvedAt,
      createdAt: exceptions.createdAt,
    })
    .from(exceptions)
    .innerJoin(trips, eq(exceptions.tripId, trips.id))
    .innerJoin(reasonCodes, eq(exceptions.reasonCodeId, reasonCodes.id))
    .leftJoin(customers, eq(trips.customerId, customers.id))
    .leftJoin(excOriginLoc, eq(trips.originLocationId, excOriginLoc.id))
    .leftJoin(excDestLoc, eq(trips.destinationLocationId, excDestLoc.id))
    .leftJoin(excOwnerUser, eq(exceptions.ownerUserId, excOwnerUser.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(exceptions.openedAt))
    .limit(filters.limit)
    .offset(filters.offset);

  return rows.map((r) => ({
    id: r.id,
    tripId: r.tripId,
    externalTripId: r.externalTripId,
    customerId: r.customerId,
    customerName: r.customerName,
    laneLabel: r.laneId ? `${r.originCode ?? ""} → ${r.destinationCode ?? ""}` : null,
    reasonCodeId: r.reasonCodeId,
    reasonCode: r.reasonCode,
    category: r.category,
    reasonLabelPt: r.reasonLabelPt,
    severity: r.severity,
    status: r.status,
    responsibleParty: r.responsibleParty,
    ownerUserId: r.ownerUserId,
    ownerName: r.ownerName,
    description: r.description,
    openedAt: r.openedAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Active reason codes for the create-exception form, ordered by `sort_order` (FR-010). */
export async function queryReasonCodes(): Promise<ReasonCodeOption[]> {
  const rows = await db
    .select({
      id: reasonCodes.id,
      code: reasonCodes.code,
      category: reasonCodes.category,
      labelPt: reasonCodes.labelPt,
      defaultSeverity: reasonCodes.defaultSeverity,
      defaultResponsibleParty: reasonCodes.defaultResponsibleParty,
      sortOrder: reasonCodes.sortOrder,
    })
    .from(reasonCodes)
    .where(eq(reasonCodes.active, true))
    .orderBy(asc(reasonCodes.sortOrder));
  return rows;
}

const ruleOriginLoc = alias(locations, "rule_origin_loc");
const ruleDestLoc = alias(locations, "rule_dest_loc");

/** All per-customer SLA rules with customer name + derived lane label (US5 admin list). */
export async function queryCustomerSlaRules(): Promise<CustomerSlaRuleItem[]> {
  const rows = await db
    .select({
      id: customerSlaRules.id,
      customerId: customerSlaRules.customerId,
      customerName: customers.name,
      laneId: customerSlaRules.laneId,
      originCode: ruleOriginLoc.code,
      destinationCode: ruleDestLoc.code,
      vehicleType: customerSlaRules.vehicleType,
      pickupToleranceMinutes: customerSlaRules.pickupToleranceMinutes,
      deliveryToleranceMinutes: customerSlaRules.deliveryToleranceMinutes,
      confirmationCutoffMinutes: customerSlaRules.confirmationCutoffMinutes,
      atRiskWarningMinutes: customerSlaRules.atRiskWarningMinutes,
      effectiveStart: customerSlaRules.effectiveStart,
      effectiveEnd: customerSlaRules.effectiveEnd,
      active: customerSlaRules.active,
      createdAt: customerSlaRules.createdAt,
      updatedAt: customerSlaRules.updatedAt,
    })
    .from(customerSlaRules)
    .leftJoin(customers, eq(customerSlaRules.customerId, customers.id))
    .leftJoin(lanes, eq(customerSlaRules.laneId, lanes.id))
    .leftJoin(ruleOriginLoc, eq(lanes.originLocationId, ruleOriginLoc.id))
    .leftJoin(ruleDestLoc, eq(lanes.destinationLocationId, ruleDestLoc.id))
    .orderBy(asc(customers.name), desc(customerSlaRules.effectiveStart));

  return rows.map((r) => ({
    id: r.id,
    customerId: r.customerId,
    customerName: r.customerName,
    laneId: r.laneId,
    laneLabel: r.laneId ? `${r.originCode ?? ""} → ${r.destinationCode ?? ""}` : null,
    vehicleType: r.vehicleType,
    pickupToleranceMinutes: r.pickupToleranceMinutes,
    deliveryToleranceMinutes: r.deliveryToleranceMinutes,
    confirmationCutoffMinutes: r.confirmationCutoffMinutes,
    atRiskWarningMinutes: r.atRiskWarningMinutes,
    effectiveStart: r.effectiveStart ? r.effectiveStart.toISOString() : null,
    effectiveEnd: r.effectiveEnd ? r.effectiveEnd.toISOString() : null,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Feature 008 — billing lists, export history, rate/requirement/type admin reads (R13)
// ---------------------------------------------------------------------------

export interface BillingListRow {
  tripId: string;
  externalTripId: string | null;
  customerId: string;
  customerName: string;
  laneLabel: string | null;
  currentStatus: TripStatus;
  billingStatus: BillingStatus;
  billingPeriod: string | null;
  finalBillableCents: number | null;
  hasMissingProof: boolean;
  updatedAt: string;
}

// Origin/destination aliases for the billing-list lane label (reuse the board pattern).
const billOriginLoc = alias(locations, "bill_origin_loc");
const billDestLoc = alias(locations, "bill_dest_loc");

/**
 * The billing pending / ready list (FR-019): the billing-phase trips in the requested phase, filtered
 * by customer + `YYYY-MM` period, with each trip's computed final billable value and a missing-proof
 * indicator. `scope='pending'` → `billing_pending`; `scope='ready'` → `billing_ready`.
 */
export async function queryBillingList(args: {
  scope: "pending" | "ready";
  customerId?: string;
  billingPeriod?: string;
}): Promise<BillingListRow[]> {
  const status: TripStatus = args.scope === "ready" ? "billing_ready" : "billing_pending";
  const conditions: SQL[] = [eq(trips.currentStatus, status)];
  if (args.customerId) conditions.push(eq(trips.customerId, args.customerId));
  if (args.billingPeriod) conditions.push(eq(billingItems.billingPeriod, args.billingPeriod));

  const finalBillable = sql<string | null>`${billingItems.baseFreightCents} + COALESCE((
    SELECT SUM(CASE WHEN ba.type = 'discount' THEN -ba.amount_cents ELSE ba.amount_cents END)
    FROM ${billingAdjustments} ba
    WHERE ba.billing_item_id = ${billingItems.id} AND ba.removed_at IS NULL
  ), 0)`;

  const rows = await db
    .select({
      tripId: trips.id,
      externalTripId: trips.externalTripId,
      customerId: trips.customerId,
      customerName: customers.name,
      originCode: billOriginLoc.code,
      destinationCode: billDestLoc.code,
      laneId: trips.laneId,
      currentStatus: trips.currentStatus,
      billingPeriod: billingItems.billingPeriod,
      finalBillableCents: finalBillable,
      hasMissingProof: missingBillingDocumentsSql(),
      updatedAt: trips.updatedAt,
    })
    .from(trips)
    .innerJoin(billingItems, eq(billingItems.tripId, trips.id))
    .leftJoin(customers, eq(trips.customerId, customers.id))
    .leftJoin(billOriginLoc, eq(trips.originLocationId, billOriginLoc.id))
    .leftJoin(billDestLoc, eq(trips.destinationLocationId, billDestLoc.id))
    .where(and(...conditions))
    .orderBy(asc(trips.updatedAt));

  return rows.map((r) => ({
    tripId: r.tripId,
    externalTripId: r.externalTripId,
    customerId: r.customerId,
    customerName: r.customerName ?? "",
    laneLabel: r.laneId ? `${r.originCode ?? ""} → ${r.destinationCode ?? ""}` : null,
    currentStatus: r.currentStatus,
    billingStatus: billingStatus(r.currentStatus),
    billingPeriod: r.billingPeriod,
    finalBillableCents: r.finalBillableCents == null ? null : Number(r.finalBillableCents),
    hasMissingProof: Boolean(r.hasMissingProof),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export interface ExportBatchRow {
  id: string;
  customerId: string;
  customerName: string;
  billingPeriod: string;
  format: string;
  status: string;
  tripCount: number;
  totalAmountCents: number;
  fileStorageKey: string | null;
  errorMessage: string | null;
  generatedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

/** Export-batch history (BILL-008), newest-first, optionally filtered by customer + period. */
export async function queryExportBatches(
  filters: { customerId?: string; billingPeriod?: string } = {},
): Promise<ExportBatchRow[]> {
  const conditions: SQL[] = [];
  if (filters.customerId) conditions.push(eq(exportBatches.customerId, filters.customerId));
  if (filters.billingPeriod)
    conditions.push(eq(exportBatches.billingPeriod, filters.billingPeriod));

  const rows = await db
    .select({
      id: exportBatches.id,
      customerId: exportBatches.customerId,
      customerName: customers.name,
      billingPeriod: exportBatches.billingPeriod,
      format: exportBatches.format,
      status: exportBatches.status,
      tripCount: exportBatches.tripCount,
      totalAmountCents: exportBatches.totalAmountCents,
      fileStorageKey: exportBatches.fileStorageKey,
      errorMessage: exportBatches.errorMessage,
      generatedByUserId: exportBatches.generatedByUserId,
      createdAt: exportBatches.createdAt,
      updatedAt: exportBatches.updatedAt,
    })
    .from(exportBatches)
    .leftJoin(customers, eq(exportBatches.customerId, customers.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(exportBatches.createdAt));

  return rows.map((r) => ({
    id: r.id,
    customerId: r.customerId,
    customerName: r.customerName ?? "",
    billingPeriod: r.billingPeriod,
    format: r.format,
    status: r.status,
    tripCount: r.tripCount,
    totalAmountCents: Number(r.totalAmountCents),
    fileStorageKey: r.fileStorageKey,
    errorMessage: r.errorMessage,
    generatedByUserId: r.generatedByUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export interface RateRowView {
  id: string;
  customerId: string;
  customerName: string;
  laneId: string | null;
  laneLabel: string | null;
  vehicleType: string | null;
  baseAmountCents: number;
  currency: string;
  tollHandlingRule: string | null;
  waitingTimeRule: string | null;
  extraStopRule: string | null;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const rateOriginLoc = alias(locations, "rate_origin_loc");
const rateDestLoc = alias(locations, "rate_dest_loc");

/** All rates with customer name + derived lane label (rate admin list). */
export async function queryRates(filters: { customerId?: string } = {}): Promise<RateRowView[]> {
  const conditions: SQL[] = [];
  if (filters.customerId) conditions.push(eq(rates.customerId, filters.customerId));

  const rows = await db
    .select({
      id: rates.id,
      customerId: rates.customerId,
      customerName: customers.name,
      laneId: rates.laneId,
      originCode: rateOriginLoc.code,
      destinationCode: rateDestLoc.code,
      vehicleType: rates.vehicleType,
      baseAmountCents: rates.baseAmountCents,
      currency: rates.currency,
      tollHandlingRule: rates.tollHandlingRule,
      waitingTimeRule: rates.waitingTimeRule,
      extraStopRule: rates.extraStopRule,
      effectiveStart: rates.effectiveStart,
      effectiveEnd: rates.effectiveEnd,
      active: rates.active,
      createdAt: rates.createdAt,
      updatedAt: rates.updatedAt,
    })
    .from(rates)
    .leftJoin(customers, eq(rates.customerId, customers.id))
    .leftJoin(lanes, eq(rates.laneId, lanes.id))
    .leftJoin(rateOriginLoc, eq(lanes.originLocationId, rateOriginLoc.id))
    .leftJoin(rateDestLoc, eq(lanes.destinationLocationId, rateDestLoc.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(customers.name), desc(rates.effectiveStart));

  return rows.map((r) => ({
    id: r.id,
    customerId: r.customerId,
    customerName: r.customerName ?? "",
    laneId: r.laneId,
    laneLabel: r.laneId ? `${r.originCode ?? ""} → ${r.destinationCode ?? ""}` : null,
    vehicleType: r.vehicleType,
    baseAmountCents: Number(r.baseAmountCents),
    currency: r.currency,
    tollHandlingRule: r.tollHandlingRule,
    waitingTimeRule: r.waitingTimeRule,
    extraStopRule: r.extraStopRule,
    effectiveStart: r.effectiveStart ? r.effectiveStart.toISOString() : null,
    effectiveEnd: r.effectiveEnd ? r.effectiveEnd.toISOString() : null,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export interface DocumentRequirementView {
  id: string;
  customerId: string;
  customerName: string;
  documentTypeId: string;
  documentTypeCode: string;
  documentTypeLabelPt: string;
  requiredForCompletion: boolean;
  requiredForBilling: boolean;
  laneId: string | null;
  laneLabel: string | null;
  vehicleType: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const reqOriginLoc = alias(locations, "req_origin_loc");
const reqDestLoc = alias(locations, "req_dest_loc");

/** A customer's document-requirement checklist with customer/type/lane labels (US3 admin list). */
export async function queryDocumentRequirements(
  filters: { customerId?: string } = {},
): Promise<DocumentRequirementView[]> {
  const conditions: SQL[] = [];
  if (filters.customerId) conditions.push(eq(documentRequirements.customerId, filters.customerId));

  const rows = await db
    .select({
      id: documentRequirements.id,
      customerId: documentRequirements.customerId,
      customerName: customers.name,
      documentTypeId: documentRequirements.documentTypeId,
      documentTypeCode: documentTypes.code,
      documentTypeLabelPt: documentTypes.labelPt,
      requiredForCompletion: documentRequirements.requiredForCompletion,
      requiredForBilling: documentRequirements.requiredForBilling,
      laneId: documentRequirements.laneId,
      originCode: reqOriginLoc.code,
      destinationCode: reqDestLoc.code,
      vehicleType: documentRequirements.vehicleType,
      active: documentRequirements.active,
      createdAt: documentRequirements.createdAt,
      updatedAt: documentRequirements.updatedAt,
    })
    .from(documentRequirements)
    .leftJoin(customers, eq(documentRequirements.customerId, customers.id))
    .innerJoin(documentTypes, eq(documentRequirements.documentTypeId, documentTypes.id))
    .leftJoin(lanes, eq(documentRequirements.laneId, lanes.id))
    .leftJoin(reqOriginLoc, eq(lanes.originLocationId, reqOriginLoc.id))
    .leftJoin(reqDestLoc, eq(lanes.destinationLocationId, reqDestLoc.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(customers.name), asc(documentTypes.sortOrder));

  return rows.map((r) => ({
    id: r.id,
    customerId: r.customerId,
    customerName: r.customerName ?? "",
    documentTypeId: r.documentTypeId,
    documentTypeCode: r.documentTypeCode,
    documentTypeLabelPt: r.documentTypeLabelPt,
    requiredForCompletion: r.requiredForCompletion,
    requiredForBilling: r.requiredForBilling,
    laneId: r.laneId,
    laneLabel: r.laneId ? `${r.originCode ?? ""} → ${r.destinationCode ?? ""}` : null,
    vehicleType: r.vehicleType,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export interface DocumentTypeView {
  id: string;
  code: string;
  labelPt: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** The document-type master (admin list + upload type picker), ordered by sort order. */
export async function queryDocumentTypes(): Promise<DocumentTypeView[]> {
  const rows = await db
    .select()
    .from(documentTypes)
    .orderBy(asc(documentTypes.sortOrder), asc(documentTypes.code));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    labelPt: r.labelPt,
    active: r.active,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}
