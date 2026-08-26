import { NextResponse } from "next/server";
import { estacoesComCoordenada } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * AS ESTAÇÕES QUE JÁ TÊM COORDENADA (2026-08-26, a pedido).
 *
 * É o que permite ao painel de veículos por perto trocar "está na cidade da coleta" por "está a
 * 25 km" — e o que diz, no mapa, onde a coleta fica.
 *
 * `view_all_trips`: mesma chave do painel que a consome. Coordenada de estação não é dado sensível
 * e não vale uma permissão própria.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    return NextResponse.json({ estacoes: await estacoesComCoordenada() });
  } catch (error) {
    return handleRouteError(error);
  }
}
