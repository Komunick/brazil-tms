import { NextResponse } from "next/server";
import { inferFileType } from "@brazil-tms/shared";
import { Conflict, handleRouteError } from "@/lib/api/respond";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { importPortalExecution } from "@/lib/imports/portal-execution-import";

export const dynamic = "force-dynamic";

/**
 * POST /api/imports/portal-execution — record what the trucks actually did, from the customer's own
 * portal export. Requires `import_trips`: it writes trip milestones and moves trips along the
 * status machine, which is the same authority the trip import needs.
 *
 * It never CREATES a trip — the plan comes from the planning import, and a trip conjured from an
 * execution row would have no plan to be measured against. Rows for trips the TMS does not know are
 * reported back, not invented.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "import_trips");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new Conflict("NO_FILE", "Arquivo do portal obrigatório.");
    }
    if (inferFileType(file.name) !== "csv") {
      throw new Conflict(
        "UNSUPPORTED_FILE_TYPE",
        "Envie o export do portal em .csv — é o formato que ele gera.",
      );
    }

    // WHICH tab of the portal this file came from — and therefore whether it may create trips.
    // Refused rather than defaulted: guessing wrong in the `plan` direction manufactures thousands
    // of finished trips, and guessing wrong the other way silently imports nothing.
    const mode = String(form.get("mode") ?? "");
    if (mode !== "plan" && mode !== "execution") {
      throw new Conflict(
        "MODE_REQUIRED",
        "Informe se o arquivo é da aba Planejado (plano) ou Concluído (execução).",
      );
    }

    const customerCode = String(form.get("customerCode") ?? "SHOPEE");
    const result = await importPortalExecution({
      fileName: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      customerCode,
      actorUserId: ctx.userId,
      mode,
    });

    return NextResponse.json({ result });
  } catch (error) {
    return handleRouteError(error);
  }
}
