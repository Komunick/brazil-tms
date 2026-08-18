import { NextResponse } from "next/server";
import { checkAssignmentSchema } from "@brazil-tms/shared";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { checkAssignment } from "@/lib/trips/trip-assignments";

export const dynamic = "force-dynamic";

/**
 * POST /api/trips/:id/assignment/check — read-only dry-run eligibility (006, R10). Requires
 * `assign_resources`. Gathers context for the candidate resources and runs the server-authoritative
 * evaluator; **writes nothing**. Powers the inline warnings in the assignment panel / Dispatch Board
 * so the UI displays — but never owns — conflict authority. Returns every `Finding` (`[]` ⇒ clean).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");
    const { id } = await params;
    const input = checkAssignmentSchema.parse(await request.json());

    const findings = await checkAssignment(id, input);
    return NextResponse.json({ findings });
  } catch (error) {
    // A missing trip is 404, straight from `handleRouteError` now that the service throws `NotFound`.
    return handleRouteError(error);
  }
}
