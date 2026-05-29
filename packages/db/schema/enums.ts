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
