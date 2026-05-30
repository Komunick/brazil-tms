import { NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { apiError, handleRouteError } from "@/lib/api/respond";
import { getTrip } from "@/lib/trips/trips-service";

export const dynamic = "force-dynamic";

/** GET /api/trips/:id — trip detail (events + audit + billing projection). Requires `manage_trips`. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_trips");
    const { id } = await params;
    const item = await getTrip(id);
    if (!item) return apiError(404, "NOT_FOUND", "Viagem não encontrada.");
    return NextResponse.json({ item });
  } catch (error) {
    return handleRouteError(error);
  }
}
