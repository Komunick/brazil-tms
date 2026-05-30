import { NextResponse } from "next/server";
import { createTripSchema } from "@brazil-tms/shared";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { listTrips } from "@/lib/trips/trips-service";
import { createOrUpdateTripManually } from "@/lib/imports/manual-create";

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

/**
 * POST /api/trips — manual single-trip create (feature 004, US6). Requires `import_trips` (reuses the
 * import permission — a manual entry is the single-row equivalent of an import). Parses the body with
 * `createTripSchema` (import batch forced null) and applies the SAME match semantics as the import
 * confirm: an existing `(customer, externalTripId)` match is updated (`200`); otherwise a new trip is
 * created (`201`). Returns the `TripDetail`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "import_trips");

    const input = createTripSchema.parse(await request.json());
    const { item, updated } = await createOrUpdateTripManually(
      { ...input, importBatchId: null },
      ctx.userId,
    );
    return NextResponse.json({ item }, { status: updated ? 200 : 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
