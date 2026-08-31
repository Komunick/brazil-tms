import { NextResponse } from "next/server";
import { z } from "zod";
import { gravarSelosDaPessoa } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

const schema = z.object({ selos: z.array(z.string().uuid()).max(10) });

/**
 * Os selos de uma pessoa — ESTADO FINAL, sem `add`/`remove`.
 *
 * Esta rota NÃO escreve em `cargo_permissoes` nem em `users.cargo_id`, e é por construção que o
 * FR-013 vale: não existe caminho de selo até capacidade.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_users");
    const { id } = await params;
    const { selos } = schema.parse(await request.json());
    await gravarSelosDaPessoa(id, selos, ctx.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
