import { NextResponse } from "next/server";
import { listarMotoristasDoPortal } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/portal-drivers — quem o PORTAL aceita como motorista, para a tela de atribuição.
 *
 * Não é o cadastro de motoristas do TMS: para escalar alguém lá é preciso o id DELE lá, e o portal
 * só aceita quem está no cadastro dele. A lista é aprendida do que o robô já trouxe — ver
 * `portal-drivers.ts` para por que isso é melhor do que pedir o cadastro inteiro ao fornecedor.
 *
 * Mesma permissão da atribuição (`assign_resources`): quem não pode escalar não precisa da lista.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");
    return NextResponse.json({ items: await listarMotoristasDoPortal() });
  } catch (error) {
    return handleRouteError(error);
  }
}
