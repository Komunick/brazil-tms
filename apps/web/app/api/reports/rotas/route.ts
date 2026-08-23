import { NextResponse } from "next/server";
import { readMalhaDeRotas } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/rotas — a malha: cada par origem → destino com o que já rodou (2026-08-23).
 *
 * Sem chave nova, como o resto de Relatórios: `view_all_trips` é a chave de superfície de leitura,
 * e esta é a mais leitura de todas — não aceita parâmetro nenhum e não muda nada.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    return NextResponse.json({ rotas: await readMalhaDeRotas() });
  } catch (error) {
    return handleRouteError(error);
  }
}
