/**
 * The single trip domain model (contracts/trip-domain-api.md; FR-008..FR-013, FR-016, FR-023).
 *
 * This module is the ONE source of truth slices 004–009 import — they MUST NOT declare a parallel
 * status set, a second billing state machine, or a private transition table (FR-023). It mirrors the
 * `trip_status` / `trip_event_type` / `trip_event_source` / `cancellation_responsible_party` pgEnums
 * in `@brazil-tms/db` (the persistence side); the two MUST stay in lockstep (PR review enforces it).
 *
 * Why the table lives here and not in SQL (R1): the BFF/service layer is already the business-rule
 * layer (RLS deferred). One TypeScript table is trivially unit-testable and imported unchanged by
 * later slices; Postgres holds only enum membership — NO trigger encodes legality.
 */

// ---------------------------------------------------------------------------
// Status set (18 values, lifecycle order — R2, FR-008)
// ---------------------------------------------------------------------------

export const TRIP_STATUSES = [
  "received",
  "validation_error",
  "validated",
  "assigned",
  "confirmed",
  "at_origin",
  "loading",
  "loaded",
  "in_transit",
  "at_destination",
  "unloading",
  "unloaded",
  "completed",
  "billing_pending",
  "billing_ready",
  "billed",
  "cancelled",
  "disputed",
] as const;

export type TripStatus = (typeof TRIP_STATUSES)[number];

/** Trip event vocabulary (foundation set; 007 extends via migration). Mirrors `trip_event_type`. */
export const TRIP_EVENT_TYPES = [
  "status_change",
  "origin_arrived",
  "loaded",
  "departed",
  "destination_arrived",
  "unloaded",
  "completed",
] as const;

export type TripEventType = (typeof TRIP_EVENT_TYPES)[number];

/** How an event was recorded (007 adds `gps`, `driver_input`). Mirrors `trip_event_source`. */
export const TRIP_EVENT_SOURCES = ["system", "operator_manual", "import"] as const;

export type TripEventSource = (typeof TRIP_EVENT_SOURCES)[number];

/** Fixed cancellation responsible-party set — verbatim PRD §19.5 (R8). Mirrors the pgEnum. */
export const CANCELLATION_RESPONSIBLE_PARTIES = [
  "customer_caused",
  "brazil_transports_caused",
  "carrier_caused",
  "unknown",
] as const;

export type ResponsibleParty = (typeof CANCELLATION_RESPONSIBLE_PARTIES)[number];

// ---------------------------------------------------------------------------
// The single legal-transition table (clarification 2026-05-29: cancellable through at_destination)
// ---------------------------------------------------------------------------

/**
 * The ONE legal-transition table (FR-008..FR-011). `disputed` lists only the static `cancelled`
 * target; its dynamic return to the status it was entered from is resolved per-trip via
 * `canTransition(from, to, { disputedFromStatus })`. Optional sub-states `loading`/`unloading` may be
 * skipped (`at_origin → in_transit`, `at_destination → unloaded`). Cancellation is legal from any
 * non-terminal status up to and including `at_destination`; once unloading begins the trip goes to
 * `completed`/`disputed`. `cancelled` is terminal.
 */
export const TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  received: ["validated", "validation_error", "cancelled"],
  validation_error: ["received"],
  validated: ["assigned", "cancelled"],
  assigned: ["confirmed", "validated", "cancelled"], // validated = unassign
  confirmed: ["at_origin", "cancelled"],
  at_origin: ["loading", "in_transit", "cancelled"],
  loading: ["loaded", "cancelled"],
  loaded: ["in_transit", "cancelled"],
  in_transit: ["at_destination", "cancelled"],
  at_destination: ["unloading", "unloaded", "cancelled"],
  unloading: ["unloaded"],
  unloaded: ["completed"],
  completed: ["billing_pending", "disputed"],
  billing_pending: ["billing_ready", "disputed"],
  billing_ready: ["billed", "disputed"],
  billed: ["disputed"],
  disputed: ["cancelled"], // + disputed_from_status, resolved dynamically per trip
  cancelled: [],
};

/**
 * Is `from → to` a declared legal transition? For `disputed`, the dynamic return to
 * `disputedFromStatus` is allowed in addition to the static `cancelled` (FR-011) — the caller passes
 * the trip's recorded `disputed_from_status`.
 */
export function canTransition(
  from: TripStatus,
  to: TripStatus,
  opts: { disputedFromStatus?: TripStatus | null } = {},
): boolean {
  if (from === "disputed" && opts.disputedFromStatus && to === opts.disputedFromStatus) {
    return true;
  }
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Billing-phase projection (R3, FR-013) — derived, never a stored column
// ---------------------------------------------------------------------------

/** The billing-phase tail of the single machine. */
export const BILLING_PHASE_STATUSES = [
  "billing_pending",
  "billing_ready",
  "billed",
  "disputed",
] as const;

export type BillingStatus = (typeof BILLING_PHASE_STATUSES)[number] | null;

/**
 * Project `current_status` onto its billing-phase value (R3). Returns the status itself when it is a
 * billing-phase state, else `null`. There is NO stored `billing_status` column — a projection cannot
 * drift from `current_status` by construction (Clarification Q2, SC-005).
 */
export function billingStatus(s: TripStatus): BillingStatus {
  return (BILLING_PHASE_STATUSES as readonly TripStatus[]).includes(s) ? (s as BillingStatus) : null;
}

// ---------------------------------------------------------------------------
// Critical-field default set (R9, FR-016) — labeled documented default, not a config table
// ---------------------------------------------------------------------------

/**
 * Fields whose change MUST produce an audit row (SC-003). A system-wide policy, NOT per-customer
 * variation, so a labeled code constant is appropriate (Constitution II documented-default) rather
 * than a config table (R9). `updateTripPlan` writes a `trip.plan_update` audit only when a CHANGED
 * field is in this set; `current_status`/`cancellationReasonCode` are audited by the transition/
 * cancel services. Assignment references are added to this set by slice 006.
 */
export const TRIP_CRITICAL_FIELDS = [
  "plannedPickupWindowStart",
  "plannedPickupWindowEnd",
  "plannedDeliveryWindowStart",
  "plannedDeliveryWindowEnd",
  "plannedVehicleType",
  "currentStatus",
  "billingStatus",
  "cancellationReasonCode",
] as const;
