import { NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { errorReportUrl } from "@/lib/imports/import-batches-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/imports/:id/error-report — issues a short-lived signed download URL for a batch's
 * generated error report (US2, FR-014). Server-mediated only (no public object URL, R12). Requires
 * `import_trips`; `404` when the batch has no error report (a missing report is not a business
 * conflict, so it does not flow through Conflict).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "import_trips");
    const { id } = await params;
    const url = await errorReportUrl(id);
    if (!url) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Nenhum relatório de erros disponível." } },
        { status: 404 },
      );
    }
    return NextResponse.json({ url });
  } catch (error) {
    return handleRouteError(error);
  }
}
