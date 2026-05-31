/**
 * Typed audit actions (data-model.md / research §10). The DB column is plain text; this union is
 * extended per feature. Feature 001 emits the four user-administration actions below.
 */
export type AuditAction =
  | "user.create"
  | "user.role_change"
  | "user.status_change"
  | "user.invite_sent"
  // feature 002 — master data (data-model.md §Audit actions). `<entity>.create|update|archive` for
  // all seven entities; `+ .status_change` for the three operational resources.
  | "customer.create"
  | "customer.update"
  | "customer.archive"
  | "location.create"
  | "location.update"
  | "location.archive"
  | "lane.create"
  | "lane.update"
  | "lane.archive"
  | "carrier.create"
  | "carrier.update"
  | "carrier.archive"
  | "driver.create"
  | "driver.update"
  | "driver.archive"
  | "driver.status_change"
  | "vehicle.create"
  | "vehicle.update"
  | "vehicle.archive"
  | "vehicle.status_change"
  | "trailer.create"
  | "trailer.update"
  | "trailer.archive"
  | "trailer.status_change"
  // feature 003 — trip domain (data-model.md §Audit actions). Every critical-field change and
  // lifecycle action writes exactly one immutable audit row (SC-003).
  | "trip.create" // newValue = original_plan summary + initial status
  | "trip.plan_update" // accepted customer update to live planned_* fields (per-field prev/new)
  | "trip.status_change" // prev/new current_status (also recorded as a trip_event)
  | "trip.cancel" // reason_code, responsible_party, billing_impact, cancelled_at
  // feature 004 — trip import (data-model.md §Audit actions). Batch upload + confirm, plus the
  // config surfaces (templates, status mappings, location aliases). Per-trip `trip.create` /
  // `trip.plan_update` (003) also fire during confirm, with `reason` referencing the batch id.
  | "import.create" // batch uploaded (entityType 'import_batch')
  | "import.confirm" // batch confirmed (entityType 'import_batch')
  | "import_template.create"
  | "import_template.update"
  | "status_mapping.upsert"
  | "location_alias.create";

/** The four actions audited by feature 001 (useful for tests / iteration). */
export const AUDIT_ACTIONS_001: readonly AuditAction[] = [
  "user.create",
  "user.role_change",
  "user.status_change",
  "user.invite_sent",
];

/**
 * Every audit action across 001–004 (the global audit screen must have an `AuditActions` i18n label
 * for each — the screen looks up `action.replaceAll(".", "_")`). Kept in lockstep with the union above;
 * `satisfies` flags a typo, and the i18n guard test asserts each has a label.
 */
export const ALL_AUDIT_ACTIONS = [
  "user.create",
  "user.role_change",
  "user.status_change",
  "user.invite_sent",
  "customer.create",
  "customer.update",
  "customer.archive",
  "location.create",
  "location.update",
  "location.archive",
  "lane.create",
  "lane.update",
  "lane.archive",
  "carrier.create",
  "carrier.update",
  "carrier.archive",
  "driver.create",
  "driver.update",
  "driver.archive",
  "driver.status_change",
  "vehicle.create",
  "vehicle.update",
  "vehicle.archive",
  "vehicle.status_change",
  "trailer.create",
  "trailer.update",
  "trailer.archive",
  "trailer.status_change",
  "trip.create",
  "trip.plan_update",
  "trip.status_change",
  "trip.cancel",
  "import.create",
  "import.confirm",
  "import_template.create",
  "import_template.update",
  "status_mapping.upsert",
  "location_alias.create",
] as const satisfies readonly AuditAction[];

/**
 * Input to `writeAudit` — the durable record minus DB-generated fields (id, created_at).
 * previous/new values are snapshots of only the relevant fields, never whole rows.
 */
export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: AuditAction;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  actorUserId: string;
  reason?: string | null;
}
