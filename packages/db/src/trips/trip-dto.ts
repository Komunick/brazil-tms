import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq } from "drizzle-orm";
import {
  auditLogs,
  carriers,
  drivers,
  tripAssignments,
  tripEvents,
  trailers,
  trips,
  vehicles,
} from "../../schema";
import type { DB } from "../client";
import {
  billingStatus,
  type AuditAction,
  type BillingStatus,
  type ResponsibleParty,
  type TripEventSource,
  type TripEventType,
  type TripStatus,
} from "@brazil-tms/shared";

/**
 * Shared trip DTO mapping + detail loader for the feature 003 trip services (contract:
 * contracts/bff-endpoints.md §Shared returned shapes). Every mutating service (createTrip,
 * updateTripPlan, transitionTripStatus, cancelTrip) and the read-only inspector return the SAME
 * `TripDetail`/`TripSummary` shape, so the mapping lives here once (DRY — four producers, well past
 * the ≥3 threshold). `billingStatus` is the derived projection (R3); there is no stored column.
 *
 * `loadTripDetail` accepts either the live `db` or a transaction handle (`tx`) so a mutation can
 * return the freshly-written detail inside its own transaction.
 */

/** Anything that can run a `select` — the live `db` or a `tx`. */
type Querier = Pick<DB, "select">;

export type { BillingStatus } from "@brazil-tms/shared";

export interface TripSummary {
  id: string;
  customerId: string;
  externalTripId: string | null;
  originLocationId: string;
  destinationLocationId: string;
  laneId: string | null;
  currentStatus: TripStatus;
  billingStatus: BillingStatus;
  slaStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TripEventDto {
  id: string;
  eventType: TripEventType;
  statusBefore: TripStatus | null;
  statusAfter: TripStatus | null;
  eventTimestamp: string | null;
  source: TripEventSource;
  actorUserId: string | null;
  locationId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AuditEntryDto {
  id: string;
  action: AuditAction;
  previousValue: unknown;
  newValue: unknown;
  actorUserId: string;
  reason: string | null;
  createdAt: string;
}

/**
 * A trip-assignment row projected for the detail view (data-model.md §1, §5). Joins the resource name
 * tables so the client renders driver/vehicle/trailer/carrier labels without a second lookup. The SAME
 * shape carries both the single `currentAssignment` (the `is_current` row) and each entry of
 * `assignmentHistory` (superseded rows). All timestamps are ISO strings (UTC).
 */
export interface TripAssignmentDto {
  id: string;
  driverId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  trailerId: string | null;
  trailerLabel: string | null;
  carrierId: string | null;
  carrierName: string | null;
  notes: string | null;
  overrideReason: string | null;
  isCurrent: boolean;
  assignedByUserId: string;
  assignedAt: string;
  confirmedByUserId: string | null;
  confirmedAt: string | null;
  supersededByAssignmentId: string | null;
  supersededAt: string | null;
}

export interface TripDetail extends TripSummary {
  originalPlan: unknown;
  plannedPickupWindowStart: string | null;
  plannedPickupWindowEnd: string | null;
  plannedDeliveryWindowStart: string | null;
  plannedDeliveryWindowEnd: string | null;
  plannedVehicleType: string | null;
  plannedVolumeUnits: number | null;
  plannedWeightKg: number | null;
  plannedPalletCount: number | null;
  plannedRouteNotes: string | null;
  plannedServiceRequirements: unknown;
  cancellationReasonCode: string | null;
  cancellationResponsibleParty: ResponsibleParty | null;
  cancellationBillingImpact: string | null;
  cancelledAt: string | null;
  disputedFromStatus: TripStatus | null;
  events: TripEventDto[];
  audit: AuditEntryDto[];
  /** The single current (`is_current`) assignment for this trip, or null when none (006). */
  currentAssignment: TripAssignmentDto | null;
  /** Superseded assignment rows (`is_current=false`), newest-first — retained history (006). */
  assignmentHistory: TripAssignmentDto[];
}

/** The Drizzle row type for `trips` (camelCase columns; timestamps are Date). */
type TripRow = typeof trips.$inferSelect;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** Map a `trips` row to the list/summary shape with the derived billing projection. */
export function toTripSummary(row: TripRow): TripSummary {
  return {
    id: row.id,
    customerId: row.customerId,
    externalTripId: row.externalTripId,
    originLocationId: row.originLocationId,
    destinationLocationId: row.destinationLocationId,
    laneId: row.laneId,
    currentStatus: row.currentStatus,
    billingStatus: billingStatus(row.currentStatus),
    slaStatus: row.slaStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Map a `trips` row to the full detail shape (without events/audit and the assignment projection,
 * which are loaded separately in `loadTripDetail`).
 */
function toTripBase(
  row: TripRow,
): Omit<TripDetail, "events" | "audit" | "currentAssignment" | "assignmentHistory"> {
  return {
    ...toTripSummary(row),
    originalPlan: row.originalPlan,
    plannedPickupWindowStart: iso(row.plannedPickupWindowStart),
    plannedPickupWindowEnd: iso(row.plannedPickupWindowEnd),
    plannedDeliveryWindowStart: iso(row.plannedDeliveryWindowStart),
    plannedDeliveryWindowEnd: iso(row.plannedDeliveryWindowEnd),
    plannedVehicleType: row.plannedVehicleType,
    plannedVolumeUnits: row.plannedVolumeUnits,
    plannedWeightKg: row.plannedWeightKg,
    plannedPalletCount: row.plannedPalletCount,
    plannedRouteNotes: row.plannedRouteNotes,
    plannedServiceRequirements: row.plannedServiceRequirements,
    cancellationReasonCode: row.cancellationReasonCode,
    cancellationResponsibleParty: row.cancellationResponsibleParty,
    cancellationBillingImpact: row.cancellationBillingImpact,
    cancelledAt: iso(row.cancelledAt),
    disputedFromStatus: row.disputedFromStatus,
  };
}

// Drivers/vehicles/trailers/carriers each join the assignment once for display names. Aliasing keeps
// the join explicit and avoids any clash if the same tables are joined elsewhere in a wider query.
const asgDriver = alias(drivers, "asg_driver");
const asgVehicle = alias(vehicles, "asg_vehicle");
const asgTrailer = alias(trailers, "asg_trailer");
const asgCarrier = alias(carriers, "asg_carrier");

/** The assignment-row + joined-name select shape (shared by current + history loads). */
const assignmentColumns = {
  id: tripAssignments.id,
  driverId: tripAssignments.driverId,
  driverName: asgDriver.name,
  vehicleId: tripAssignments.vehicleId,
  vehiclePlate: asgVehicle.plate,
  trailerId: tripAssignments.trailerId,
  trailerLabel: asgTrailer.plate,
  carrierId: tripAssignments.carrierId,
  carrierName: asgCarrier.name,
  notes: tripAssignments.notes,
  overrideReason: tripAssignments.overrideReason,
  isCurrent: tripAssignments.isCurrent,
  assignedByUserId: tripAssignments.assignedByUserId,
  assignedAt: tripAssignments.assignedAt,
  confirmedByUserId: tripAssignments.confirmedByUserId,
  confirmedAt: tripAssignments.confirmedAt,
  supersededByAssignmentId: tripAssignments.supersededByAssignmentId,
  supersededAt: tripAssignments.supersededAt,
};

type AssignmentRow = {
  id: string;
  driverId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  trailerId: string | null;
  trailerLabel: string | null;
  carrierId: string | null;
  carrierName: string | null;
  notes: string | null;
  overrideReason: string | null;
  isCurrent: boolean;
  assignedByUserId: string;
  assignedAt: Date;
  confirmedByUserId: string | null;
  confirmedAt: Date | null;
  supersededByAssignmentId: string | null;
  supersededAt: Date | null;
};

/** Map a joined `trip_assignments` row to the public DTO (timestamps → ISO). */
function toAssignmentDto(row: AssignmentRow): TripAssignmentDto {
  return {
    id: row.id,
    driverId: row.driverId,
    driverName: row.driverName,
    vehicleId: row.vehicleId,
    vehiclePlate: row.vehiclePlate,
    trailerId: row.trailerId,
    trailerLabel: row.trailerLabel,
    carrierId: row.carrierId,
    carrierName: row.carrierName,
    notes: row.notes,
    overrideReason: row.overrideReason,
    isCurrent: row.isCurrent,
    assignedByUserId: row.assignedByUserId,
    assignedAt: row.assignedAt.toISOString(),
    confirmedByUserId: row.confirmedByUserId,
    confirmedAt: iso(row.confirmedAt),
    supersededByAssignmentId: row.supersededByAssignmentId,
    supersededAt: iso(row.supersededAt),
  };
}

/**
 * Assemble a trip's full detail: the row + the latest 50 `trip_events` (newest first) + the latest
 * 50 `audit_logs` for `entity_type='trip', entity_id=:id` (newest first) + the assignment state
 * (006): the single `is_current` row (`currentAssignment`) and the superseded rows newest-first
 * (`assignmentHistory`). Returns `null` when the trip does not exist (callers map that to a 404 /
 * NOT_FOUND). This is the SINGLE source of current/history assignment loading — both mutating
 * services and `getTripDetailView` get it here, so trips-read never re-queries assignments.
 */
export async function loadTripDetail(
  executor: Querier,
  tripId: string,
): Promise<TripDetail | null> {
  const tripRows = await executor.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  const row = tripRows[0];
  if (!row) return null;

  const eventRows = await executor
    .select()
    .from(tripEvents)
    .where(eq(tripEvents.tripId, tripId))
    .orderBy(desc(tripEvents.createdAt))
    .limit(50);

  const auditRows = await executor
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, "trip"), eq(auditLogs.entityId, tripId)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(50);

  // All assignment rows for this trip; the partial-unique index guarantees at most one is_current.
  const assignmentRows: AssignmentRow[] = await executor
    .select(assignmentColumns)
    .from(tripAssignments)
    .leftJoin(asgDriver, eq(tripAssignments.driverId, asgDriver.id))
    .leftJoin(asgVehicle, eq(tripAssignments.vehicleId, asgVehicle.id))
    .leftJoin(asgTrailer, eq(tripAssignments.trailerId, asgTrailer.id))
    .leftJoin(asgCarrier, eq(tripAssignments.carrierId, asgCarrier.id))
    .where(eq(tripAssignments.tripId, tripId))
    .orderBy(desc(tripAssignments.assignedAt));

  const current = assignmentRows.find((a) => a.isCurrent);
  const history = assignmentRows.filter((a) => !a.isCurrent);

  return {
    ...toTripBase(row),
    events: eventRows.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      statusBefore: e.statusBefore,
      statusAfter: e.statusAfter,
      eventTimestamp: iso(e.eventTimestamp),
      source: e.source,
      actorUserId: e.actorUserId,
      locationId: e.locationId,
      notes: e.notes,
      createdAt: e.createdAt.toISOString(),
    })),
    audit: auditRows.map((a) => ({
      id: a.id,
      action: a.action as AuditAction,
      previousValue: a.previousValue,
      newValue: a.newValue,
      actorUserId: a.actorUserId,
      reason: a.reason,
      createdAt: a.createdAt.toISOString(),
    })),
    currentAssignment: current ? toAssignmentDto(current) : null,
    assignmentHistory: history.map(toAssignmentDto),
  };
}
