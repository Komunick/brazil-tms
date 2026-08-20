import { NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { fleetSummary, readFleetPositions } from "@brazil-tms/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/fleet — onde a frota está agora, segundo o rastreador (2026-08-20).
 *
 * `view_all_trips`, a mesma chave do quadro e do Status do Sistema. Quem acompanha viagem precisa
 * saber onde está o caminhão dela; trancar isso atrás de uma chave de frota separaria duas metades
 * da mesma pergunta.
 *
 * DEVOLVE O RESUMO E A LISTA NA MESMA RESPOSTA. São ~98 linhas: separar em duas rotas faria a Torre
 * de Controle e a página de rastreamento consultarem coisas diferentes sobre o mesmo retrato, e
 * abriria a chance de a soma do quadro discordar da lista que ele abre — que é precisamente o
 * defeito que o cartão "NA ORIGEM" teve.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    const [summary, items] = await Promise.all([fleetSummary(), readFleetPositions()]);
    return NextResponse.json({ summary, items });
  } catch (error) {
    return handleRouteError(error);
  }
}
