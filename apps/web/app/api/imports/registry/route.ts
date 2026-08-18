import { NextResponse } from "next/server";
import { inferFileType } from "@brazil-tms/shared";
import { Conflict, handleRouteError } from "@/lib/api/respond";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { applyRegistryImport, parseRegistryWorkbook } from "@/lib/master-data/registry-import";

export const dynamic = "force-dynamic";

/**
 * POST /api/imports/registry — load the fleet registry (drivers, vehicles, trailers) from the
 * customer's planning workbook. Requires `manage_fleet_data`: this writes the resource registries,
 * NOT trips, so it is gated by the same key as the Motoristas/Veículos/Reboques screens rather than
 * by `import_trips`.
 *
 * Synchronous by design. The registry is ~1k rows read in a couple of batched statements (a trip
 * import is 10x that and streams through the worker); doing it in-request keeps the screen honest —
 * the summary it shows IS the result, not a promise of one.
 *
 * `.xlsx` only: the sheets we need live on tabs 2 and 3 of the workbook and carry their header below
 * row 1, neither of which survives a CSV export.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_fleet_data");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new Conflict("NO_FILE", "Arquivo de cadastro obrigatório.");
    }
    if (inferFileType(file.name) !== "xlsx") {
      throw new Conflict(
        "UNSUPPORTED_FILE_TYPE",
        "Envie a planilha em .xlsx — o cadastro está em abas que o .csv não carrega.",
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const parsed = await parseRegistryWorkbook(bytes);
    if (parsed.missingSheets.length === 2) {
      throw new Conflict(
        "NO_REGISTRY_SHEETS",
        "A planilha não tem as abas MOTORISTAS nem VEÍCULOSCARRETAS.",
      );
    }

    const result = await applyRegistryImport(parsed);
    return NextResponse.json({ result });
  } catch (error) {
    return handleRouteError(error);
  }
}
