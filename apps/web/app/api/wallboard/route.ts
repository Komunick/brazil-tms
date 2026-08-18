import { NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { queryWallboard } from "@/lib/trips/trips-read";

export const dynamic = "force-dynamic";

/**
 * GET /api/wallboard — o painel da TV da sala.
 *
 * Uma consulta por ciclo, com tudo que cabe na tela já ordenado e cortado no servidor: a TV não
 * escolhe nada, só desenha. Leitura pura, servida por polling do TanStack Query como o resto do app
 * (nada de Realtime).
 *
 * Continua atrás da sessão e da mesma permissão do quadro. Uma TV numa sala fechada tenta a gente a
 * abrir uma rota pública "porque é só leitura" — e aí a rota de leitura passa a expor a operação
 * inteira do cliente para quem tiver a URL. Quem liga a TV loga uma vez naquele navegador.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    const wallboard = await queryWallboard();
    return NextResponse.json({ wallboard });
  } catch (error) {
    return handleRouteError(error);
  }
}
