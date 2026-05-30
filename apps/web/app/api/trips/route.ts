import { NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { listTrips } from "@/lib/trips/trips-service";

export const dynamic = "force-dynamic";

/** GET /api/trips — list trips (US1, read-only inspector). Requires `manage_trips`. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_trips");

    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const items = await listTrips({
      status: url.searchParams.get("status") ?? undefined,
      customerId: url.searchParams.get("customerId") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      limit: limitParam ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ items });
  } catch (error) {
    return handleRouteError(error);
  }
}
