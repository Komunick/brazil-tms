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
