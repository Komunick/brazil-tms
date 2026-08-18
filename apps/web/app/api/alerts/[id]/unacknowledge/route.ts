import { NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { unacknowledgeAlert } from "@/lib/trips/alerts";

export const dynamic = "force-dynamic";

/**
 * POST /api/alerts/:id/unacknowledge — put an acknowledged alert back on the active surface
 * (2026-08-15). Same key as acknowledging (`view_all_trips`): both are read-surface triage, not a
 * domain mutation, and a way back out is part of the same act. 409 STALE_ALERT when the alert already
 * auto-resolved — its condition cleared, so there is nothing left to un-silence.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    const { id } = await params;
    const item = await unacknowledgeAlert(id);
    return NextResponse.json({ item });
  } catch (error) {
    return handleRouteError(error);
  }
}
