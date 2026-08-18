import { NextResponse } from "next/server";
import { readRecentSpotOffers } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/spot-offers — as ofertas de leilão recentes, para quem quiser avisar (2026-08-18).
 *
 * Rota PRÓPRIA, e não mais um campo dentro do painel de parede. O aviso passou a aparecer em duas
 * telas — o painel de parede e o Painel do dia —, e enfiá-lo na resposta de cada uma significaria a
 * mesma leitura escrita em dois lugares, com dois ritmos e duas chances de divergir.
 *
 * O ritmo também deixa de ser refém da tela: o Painel do dia se atualiza de minuto em minuto, o que
 * é generoso para contagem de viagens e lento demais para um aviso que dura trinta segundos.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    return NextResponse.json({ ofertas: await readRecentSpotOffers() });
  } catch (error) {
    return handleRouteError(error);
  }
}
