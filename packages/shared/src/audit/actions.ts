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
  | "trailer.status_change";

/** The four actions audited by feature 001 (useful for tests / iteration). */
export const AUDIT_ACTIONS_001: readonly AuditAction[] = [
  "user.create",
  "user.role_change",
  "user.status_change",
  "user.invite_sent",
];

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
