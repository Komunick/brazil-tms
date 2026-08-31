import { NextResponse } from "next/server";
import { apagarSelo } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * APAGA de verdade — a exceção deliberada ao princípio III nesta fatia.
 *
 * Um selo é rótulo, não fato: "Beta tester" não descreve nada que aconteceu, e o histórico de quem
 * já foi beta tester não responde pergunta nenhuma. Cargo se desativa porque o histórico dele
 * explica acesso passado; selo não explica acesso nenhum, por construção.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_users");
    const { id } = await params;
    await apagarSelo(id, ctx.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
