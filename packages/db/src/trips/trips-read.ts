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
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../client";
import {
  carriers,
  customers,
  customerSlaRules,
  drivers,
  exceptions,
  lanes,
  locations,
  reasonCodes,
  trailers,
  tripAssignments,
  trips,
  users,
  vehicles,
} from "../../schema";
import {
  ACTIVE_TRIP_STATUSES,
  EXPORT_ROW_CAP,
  billingStatus,
  billingStatusToStatuses,
  dayRangeSaoPaulo,
  type BillingStatus,
  type ExceptionFilter,
  type TripBoardQuery,
  type TripExportQuery,
  type TripStatus,
} from "@brazil-tms/shared";
import { Conflict } from "../errors";
import { loadTripDetail, type TripDetail } from "./trip-dto";

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
}

export interface TripBoardResult {
  rows: TripBoardRow[];
  total: number;
}

export type TripDetailView = TripDetail & {
  customerName: string;
  originCode: string;
  originName: string;
  destinationCode: string;
  destinationName: string;
  laneLabel: string | null;
  importBatchId: string | null;
};

export interface DashboardSummary {
  tripsTodayByStatus: { status: TripStatus; count: number }[];
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
  assignmentId: boardAsg.id,
  assignedDriverName: boardDriver.name,
  assignedVehiclePlate: boardVehicle.plate,
  assignedCarrierName: boardCarrier.name,
};

type BoardRow = {
  id: string;
  externalTripId: string | null;
  customerId: string;
  customerName: string | null;
  originCode: string | null;
  originName: string | null;
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
    isAssigned: row.assignmentId != null,
    assignedDriverName: row.assignedDriverName,
    assignedVehiclePlate: row.assignedVehiclePlate,
    assignedCarrierName: row.assignedCarrierName,
  };
}

/**
 * Build the `WHERE` from a board/export query. Filters compose with AND; the status constraint
 * applies AT MOST one of: explicit `status` list, `billingStatus` projection, or the implicit
 * `scope=active` default (the default never contradicts an explicit status/billing filter).
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
  if (!query.status?.length && !query.billingStatus && query.scope === "active") {
    conditions.push(inArray(trips.currentStatus, [...ACTIVE_TRIP_STATUSES]));
  }

  if (query.originLocationId) conditions.push(eq(trips.originLocationId, query.originLocationId));
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
    const like = `%${query.q}%`;
    const search = or(
      ilike(trips.externalTripId, like),
      ilike(customers.name, like),
      ilike(originLoc.name, like),
      ilike(destLoc.name, like),
      ilike(originLoc.code, like),
      ilike(destLoc.code, like),
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

  const [rows, totalRows] = await Promise.all([
    boardSelect().where(where).orderBy(orderBy).limit(query.limit).offset(query.offset),
    boardCount(where),
  ]);

  return {
    rows: rows.map(toBoardRow),
    total: totalRows[0]?.value ?? 0,
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
    })
    .from(trips)
    .leftJoin(customers, eq(trips.customerId, customers.id))
    .leftJoin(originLoc, eq(trips.originLocationId, originLoc.id))
    .leftJoin(destLoc, eq(trips.destinationLocationId, destLoc.id))
    .where(eq(trips.id, id))
    .limit(1);

  const row = enrichment[0];
  if (!row) return null;

  return {
    ...detail,
    customerName: row.customerName ?? "",
    originCode: row.originCode ?? "",
    originName: row.originName ?? "",
    destinationCode: row.destinationCode ?? "",
    destinationName: row.destinationName ?? "",
    laneLabel: row.laneId ? `${row.originCode ?? ""} → ${row.destinationCode ?? ""}` : null,
    importBatchId: row.importBatchId,
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
export async function queryDashboardMetrics(): Promise<DashboardSummary> {
  const { from, to } = dayRangeSaoPaulo(new Date());

  const [byStatus, billingPending, unassigned, atRisk, activeExc, pickupPct, arrivalPct] =
    await Promise.all([
      db
        .select({ status: trips.currentStatus, value: count() })
        .from(trips)
        .where(
          and(
            gte(trips.plannedPickupWindowStart, new Date(from)),
            lt(trips.plannedPickupWindowStart, new Date(to)),
          ),
        )
        .groupBy(trips.currentStatus),
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
      // Feature 007 — on-time pickup %: trips (planned pickup in the last 30 days, window known) that
      // recorded an origin arrival within the planned pickup window. NULL when no denominator yet.
      db.execute(sql`
        WITH arrivals AS (
          SELECT
            t.planned_pickup_window_end AS win_end,
            (SELECT min(coalesce(e.event_timestamp, e.created_at))
               FROM trip_events e
               WHERE e.trip_id = t.id AND e.status_after = 'at_origin') AS arrived_at
          FROM trips t
          WHERE t.planned_pickup_window_end IS NOT NULL
            AND t.planned_pickup_window_start >= now() - interval '30 days'
        )
        SELECT
          count(*) FILTER (WHERE arrived_at IS NOT NULL)::int AS denom,
          count(*) FILTER (WHERE arrived_at IS NOT NULL AND arrived_at <= win_end)::int AS num
        FROM arrivals
      `),
      // Feature 007 — on-time arrival %: same, for destination arrival vs the planned delivery window.
      db.execute(sql`
        WITH arrivals AS (
          SELECT
            t.planned_delivery_window_end AS win_end,
            (SELECT min(coalesce(e.event_timestamp, e.created_at))
               FROM trip_events e
               WHERE e.trip_id = t.id AND e.status_after = 'at_destination') AS arrived_at
          FROM trips t
          WHERE t.planned_delivery_window_end IS NOT NULL
            AND t.planned_pickup_window_start >= now() - interval '30 days'
        )
        SELECT
          count(*) FILTER (WHERE arrived_at IS NOT NULL)::int AS denom,
          count(*) FILTER (WHERE arrived_at IS NOT NULL AND arrived_at <= win_end)::int AS num
        FROM arrivals
      `),
    ]);

  const pct = (rows: Array<Record<string, unknown>>): number | null => {
    const r = rows[0];
    const denom = Number(r?.denom ?? 0);
    const num = Number(r?.num ?? 0);
    return denom > 0 ? Math.round((num / denom) * 100) : null;
  };

  return {
    tripsTodayByStatus: byStatus.map((r) => ({ status: r.status, count: r.value })),
    billingPendingCount: billingPending[0]?.value ?? 0,
    tripsAtRisk: atRisk[0]?.value ?? 0,
    unassignedTrips: unassigned[0]?.value ?? 0,
    activeExceptions: activeExc[0]?.value ?? 0,
    onTimePickupPct: pct(pickupPct as unknown as Array<Record<string, unknown>>),
    onTimeArrivalPct: pct(arrivalPct as unknown as Array<Record<string, unknown>>),
    completedMissingDocuments: null,
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
  lanes: { id: string; originLocationId: string; destinationLocationId: string }[];
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
    conditions.push(lte(exceptions.openedAt, new Date(Date.now() - filters.minAgeHours * 3_600_000)));
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
