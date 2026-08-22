import { NextResponse } from "next/server";
import { readProgramacao } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/programacao — a programação por frente: PLAN, SPOT, ORIGEM e TENDÊNCIA de cada região.
 *
 * Leitura pura, no mesmo desenho do resumo do painel: `view_all_trips`, sem Realtime, atualizada por
 * polling. Uma chamada só devolve as quatro frentes inteiras — quatro chamadas fariam os blocos da
 * mesma linha piscarem em momentos diferentes, e um quadro que se atualiza em pedaços é um quadro em
 * que ninguém confia.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    return NextResponse.json({ frentes: await readProgramacao() });
  } catch (error) {
    return handleRouteError(error);
  }
}
