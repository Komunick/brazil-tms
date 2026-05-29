import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, auditLogs } from "@brazil-tms/db";
import type { AuditAction } from "@brazil-tms/shared";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/** A single audit entry, with `createdAt` serialized as an ISO 8601 string for the client. */
interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  actorUserId: string;
  createdAt: string;
  reason: string | null;
}

/**
 * GET /api/admin/audit-logs — Admin-only read of the immutable audit trail (FR-017..FR-020a).
 * Append-only: this route exposes NO write/update/delete handler. Optional filters
 * (entityType, entityId, action) narrow the result; results are newest-first.
 * A denied request (401/403 via handleRouteError) causes no state change (SC-003).
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_audit_log");

    const params = new URL(request.url).searchParams;
    const entityType = params.get("entityType");
    const entityId = params.get("entityId");
    const action = params.get("action");

    const filters = [
      entityType ? eq(auditLogs.entityType, entityType) : undefined,
      entityId ? eq(auditLogs.entityId, entityId) : undefined,
      action ? eq(auditLogs.action, action) : undefined,
    ].filter((f): f is NonNullable<typeof f> => f !== undefined);

    const rows = await db
      .select()
      .from(auditLogs)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(auditLogs.createdAt));

    const entries: AuditLog[] = rows.map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action as AuditAction,
      previousValue: row.previousValue as Record<string, unknown> | null,
      newValue: row.newValue as Record<string, unknown> | null,
      actorUserId: row.actorUserId,
      createdAt: row.createdAt.toISOString(),
      reason: row.reason,
    }));

    return NextResponse.json({ entries });
  } catch (error) {
    return handleRouteError(error);
  }
}
