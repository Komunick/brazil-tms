import { NextResponse } from "next/server";
import { listarPlacasDoPortal } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * AS PLACAS QUE O PORTAL JÁ USOU — a lista do diálogo de atribuição (2026-08-26, a pedido).
 *
 * `assign_resources`, a mesma chave de `/api/portal-drivers`, e não `manage_fleet_data`: quem
 * preenche este campo está atribuindo, não administrando frota. As rotas de `master-data/vehicles`
 * existem e pedem a outra permissão — usá-las aqui deixaria de fora exatamente quem precisa.
 *
 * Rota irmã de `/api/portal-drivers`, com a mesma forma de resposta. Se um dia as duas precisarem
 * do mesmo tratamento, é aqui e lá que se olha.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");
    return NextResponse.json({ items: await listarPlacasDoPortal() });
  } catch (error) {
    return handleRouteError(error);
  }
}
