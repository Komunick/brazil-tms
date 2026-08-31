import { NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { criar, criarCargoSchema, lerCargos, RecusaDeCargo } from "@/lib/cargos/service";

export const dynamic = "force-dynamic";

/**
 * Os cargos e o que cada um alcança (fatia 029). Exige `manage_users` — a mesma capacidade que a
 * trava do último administrador protege.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_users");
    return NextResponse.json({ cargos: await lerCargos() });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Cria um cargo VAZIO — a tela avisa que quem entrar nele não verá nada. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_users");
    const entrada = criarCargoSchema.parse(await request.json());
    return NextResponse.json(await criar(ctx, entrada), { status: 201 });
  } catch (error) {
    if (error instanceof RecusaDeCargo) {
      return NextResponse.json({ motivos: error.motivos }, { status: 422 });
    }
    return handleRouteError(error);
  }
}
