import { NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { queryDocumentTypes } from "@/lib/trips/trips-read";

export const dynamic = "force-dynamic";

/**
 * GET /api/document-types — the document-type master (US1 upload picker + US3 admin). `view_all_trips`.
 * (POST create is added by US3, gated `manage_commercial_data`.)
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    const items = await queryDocumentTypes();
    return NextResponse.json({ items });
  } catch (error) {
    return handleRouteError(error);
  }
}
