import { NextResponse } from "next/server";
import { readMelhoresDaRotaDaViagem } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/trips/:id/melhores-motoristas — quem entrega no prazo NA ROTA desta viagem.
 *
 * `assign_resources`, e não a chave de leitura: esta lista existe para quem está escalando, e é
 * consultada de dentro do diálogo de atribuição. Quem não pode escalar não tem o que fazer com ela.
 *
 * A rota sai da própria viagem, no banco. A tela manda o id que já tem em mãos e não precisa
 * descobrir a rota antes — um passo a menos e um jeito a menos de perguntar pela rota errada.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");
    const { id } = await params;
    return NextResponse.json({ motoristas: await readMelhoresDaRotaDaViagem(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
