import { NextResponse } from "next/server";
import { readDesempenhoGeral, readDesempenhoPorRota } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/motoristas — o desempenho de entrega por motorista, e o de cada um por rota.
 *
 * As duas consultas vão juntas, numa resposta só: a tela mostra as duas ao mesmo tempo e separá-las
 * faria o recorte por rota chegar depois do geral, com a tabela pulando embaixo do dedo.
 *
 * Sem chave nova — `view_all_trips`, como o resto de Relatórios. Não aceita parâmetro e não muda nada.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    const [geral, porRota] = await Promise.all([readDesempenhoGeral(), readDesempenhoPorRota()]);
    return NextResponse.json({ geral, porRota });
  } catch (error) {
    return handleRouteError(error);
  }
}
