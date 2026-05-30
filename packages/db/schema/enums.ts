import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Closed set of application roles (data-model.md).
 * Seven MVP roles are assignable; `customer_viewer` is RESERVED and non-assignable (FR-007) —
 * it exists only so the system can recognize and explicitly reject it.
 */
export const appRole = pgEnum("app_role", [
  "admin",
  "operations_manager",
  "dispatcher",
  "control_tower",
  "fleet_coordinator",
  "finance",
  "executive_viewer",
  "customer_viewer",
]);

/**
 * Master-data enums (feature 002, data-model.md §Enums).
 * `resource_status` is the operational state of drivers/vehicles/trailers, orthogonal to the
 * archive lifecycle (R3). `ownership_type` drives the owned/subcontracted invariant (R4).
 * `vehicle_type` / `trailer_type` are documented-default code sets (R6, Constitution II labeling) —
 * extensible only via a one-line migration; confirm the concrete members with Ops.
 */
export const resourceStatus = pgEnum("resource_status", [
  "active",
  "inactive",
  "unavailable",
  "maintenance",
  "blocked",
]);

export const ownershipType = pgEnum("ownership_type", ["owned", "subcontracted"]);

export const vehicleType = pgEnum("vehicle_type", [
  "van",
  "vuc",
  "tres_quartos",
  "toco",
  "truck",
  "bitruck",
  "carreta",
  "carreta_ls",
  "bitrem",
  "rodotrem",
]);

export const trailerType = pgEnum("trailer_type", [
  "sider",
  "bau",
  "graneleiro",
  "tanque",
  "frigorifico",
  "prancha",
  "cacamba",
  "porta_container",
]);

/**
 * Trip-domain enums (feature 003, data-model.md §Enums).
 *
 * `trip_status` is the single trip status machine — exactly 18 values, in lifecycle order (R2,
 * FR-008). Legal transitions are NOT encoded here (membership only); the authoritative transition
 * table lives in `@brazil-tms/shared` (`domain/trip-status.ts`) and is the single source slices
 * 004–009 import (FR-023). Adding a status later is a one-line `ALTER TYPE ... ADD VALUE`.
 *
 * `trip_event_type` / `trip_event_source` are foundation default sets that slice 007 extends via
 * migration (e.g. `gps`, `driver_input`) — labeled scaffolding (Constitution II). `status_change`
 * events back every status transition (R6).
 *
 * `cancellation_responsible_party` is a FIXED set — verbatim PRD §19.5 (R8, FR-020). Reason codes
 * and billing-impact values are NOT enums; they are config rows in `cancellation_options` because
 * those value sets are business-blocked and must change without a type migration (Constitution V).
 */
export const tripStatus = pgEnum("trip_status", [
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
]);

export const tripEventType = pgEnum("trip_event_type", [
  "status_change",
  "origin_arrived",
  "loaded",
  "departed",
  "destination_arrived",
  "unloaded",
  "completed",
]);

export const tripEventSource = pgEnum("trip_event_source", [
  "system",
  "operator_manual",
  "import",
]);

export const cancellationResponsibleParty = pgEnum("cancellation_responsible_party", [
  "customer_caused",
  "brazil_transports_caused",
  "carrier_caused",
  "unknown",
]);

/**
 * Trip-import enums (feature 004, data-model.md §Enums).
 *
 * `import_batch_status` is the import pipeline lifecycle (R3): an upload moves
 * `received → parsing → validating → validated` (the chained parse/validate/detect-duplicates
 * jobs), then `confirming → completed` on the user's confirm action; any unrecoverable failure
 * sets `failed` (with `error_message`, original file retained).
 *
 * `import_row_outcome` is the per-row validation verdict (§11.2, FR-012). `import_row_match` is the
 * duplicate decision keyed on `(customer_id, external_trip_id)` (R7, FR-017..FR-024): a repeat is
 * `update`/`no_op` (never a blocking duplicate), an id-less look-alike is `potential_duplicate`,
 * and anything blocked (unknown location, in-file collision, validation error) is `unresolved`.
 * The fuzzy-duplicate tolerance and per-customer status/required-field config are DB config with
 * documented defaults (Constitution II) — not enum values.
 */
export const importBatchStatus = pgEnum("import_batch_status", [
  "received",
  "parsing",
  "validating",
  "validated",
  "confirming",
  "completed",
  "failed",
]);

export const importRowOutcome = pgEnum("import_row_outcome", ["valid", "warning", "error"]);

export const importRowMatch = pgEnum("import_row_match", [
  "new",
  "update",
  "no_op",
  "potential_duplicate",
  "unresolved",
]);
