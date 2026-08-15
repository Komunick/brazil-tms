import { NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, importTemplates } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/imports/templates?customerId= — the active import templates for one customer, so the
 * upload screen can offer them. Requires `import_trips`.
 *
 * The engine has always supported per-customer templates (004, R8) but the screen shipped without a
 * picker, pinning every upload to the built-in standard format. That is fine while one shape covers
 * everyone; it stops being fine the moment a customer's own file is the input — hence this list.
 * No customer id → no templates (the picker only makes sense once a customer is chosen).
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "import_trips");

    const customerId = new URL(request.url).searchParams.get("customerId");
    if (!customerId) return NextResponse.json({ items: [] });

    const items = await db
      .select({
        id: importTemplates.id,
        name: importTemplates.name,
        fileType: importTemplates.fileType,
        version: importTemplates.version,
      })
      .from(importTemplates)
      .where(
        and(
          eq(importTemplates.customerId, customerId),
          eq(importTemplates.active, true),
          isNull(importTemplates.archivedAt),
        ),
      )
      .orderBy(asc(importTemplates.name));

    return NextResponse.json({ items });
  } catch (error) {
    return handleRouteError(error);
  }
}
