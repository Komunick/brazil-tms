import { NextResponse } from "next/server";
import { transitionTripSchema } from "@brazil-tms/shared";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { transitionTripStatus } from "@/lib/trips/trip-transitions";

export const dynamic = "force-dynamic";

/**
 * POST /api/trips/:id/status — record an execution milestone (007, US1). Drives the existing 003
 * status machine (`confirmed → at_origin → [loading] → loaded → in_transit → at_destination →
 * [unloading] → unloaded → completed`); each transition appends a `status_change` event and
 * recomputes SLA. Requires `update_trip_status` (first enforcement). 409s: ILLEGAL_TRANSITION /
 * STALE_TRANSITION; 404 NOT_FOUND.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "update_trip_status");
    const { id } = await params;
    const input = transitionTripSchema.parse(await request.json());
    const item = await transitionTripStatus(id, input, ctx.userId);
    return NextResponse.json({ item });
  } catch (error) {
    return handleRouteError(error);
  }
}
