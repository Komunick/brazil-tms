import { NextResponse } from "next/server";
import { updateOperationalFieldsSchema } from "@brazil-tms/shared";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { updateOperationalFields } from "@/lib/trips/trips-service";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/trips/:id/operational-fields — the operation's own annotations on a trip: solicitação,
 * checklist, SM Raster, CT-e, doca (2026-08-15). Requires `manage_trips`, the same key that edits
 * the plan: whoever runs the trip writes these.
 *
 * Unlike the plan, there is NO post-confirmation review gate — the CT-e is normally filled in after
 * the truck rolls, and gating it would send the operation back to the spreadsheet these fields exist
 * to replace. `409 TRIP_CLOSED` once the trip is cancelled or billed.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_trips");
    const { id } = await params;
    const input = updateOperationalFieldsSchema.parse(await request.json());
    const item = await updateOperationalFields(id, input, ctx.userId);
    return NextResponse.json({ item });
  } catch (error) {
    return handleRouteError(error);
  }
}
