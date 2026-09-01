import { NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { moverPessoa, moverPessoaSchema, RecusaDeCargo } from "@/lib/cargos/service";

export const dynamic = "force-dynamic";

/**
 * Move uma pessoa de cargo (FR-009).
 *
 * Vale na PRÓXIMA REQUISIÇÃO dela, sem sair e entrar: a sessão lê o banco a cada requisição.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_users");
    const { id } = await params;
    const { cargoIds } = moverPessoaSchema.parse(await request.json());
    await moverPessoa(ctx, id, cargoIds);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RecusaDeCargo) {
      return NextResponse.json({ motivos: error.motivos }, { status: 422 });
    }
    return handleRouteError(error);
  }
}
