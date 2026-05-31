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
  drivers,
  lanes,
  locations,
  trailers,
  tripAssignments,
  trips,
  vehicles,
} from "../../schema";
import {
  ACTIVE_TRIP_STATUSES,
  EXPORT_ROW_CAP,
  billingStatus,
  billingStatusToStatuses,
  dayRangeSaoPaulo,
  type BillingStatus,
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

  const [byStatus, billingPending, unassigned] = await Promise.all([
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
  ]);

  return {
    tripsTodayByStatus: byStatus.map((r) => ({ status: r.status, count: r.value })),
    billingPendingCount: billingPending[0]?.value ?? 0,
    tripsAtRisk: null,
    unassignedTrips: unassigned[0]?.value ?? 0,
    activeExceptions: null,
    onTimePickupPct: null,
    onTimeArrivalPct: null,
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
  const [customerRows, locationRows, laneRows, driverRows, vehicleRows, trailerRows, carrierRows] =
    await Promise.all([
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
    ]);

  return {
    customers: customerRows,
    locations: locationRows,
    lanes: laneRows,
    drivers: driverRows,
    vehicles: vehicleRows,
    trailers: trailerRows,
    carriers: carrierRows,
  };
}
