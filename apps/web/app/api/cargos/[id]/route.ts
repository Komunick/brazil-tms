import { NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import {
  desativar,
  desativarCargoSchema,
  gravar,
  gravarCargoSchema,
  RecusaDeCargo,
} from "@/lib/cargos/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Grava o ESTADO FINAL do cargo — sem `add`/`remove`, a última gravação vence.
 *
 * A resposta traz O QUE FICOU GUARDADO, e não o que foi mandado: a tela não pode seguir achando que
 * gravou outra coisa.
 */
export async function PUT(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_users");
    const { id } = await params;
    const entrada = gravarCargoSchema.parse(await request.json());
    return NextResponse.json(await gravar(ctx, id, entrada));
  } catch (error) {
    if (error instanceof RecusaDeCargo) {
      return NextResponse.json({ motivos: error.motivos }, { status: 422 });
    }
    return handleRouteError(error);
  }
}

/** DESATIVA — não apaga (princípio III). Com gente dentro, exige destino. */
export async function DELETE(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_users");
    const { id } = await params;
    const entrada = desativarCargoSchema.parse(await request.json().catch(() => ({})));
    await desativar(ctx, id, entrada);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RecusaDeCargo) {
      return NextResponse.json({ motivos: error.motivos }, { status: 422 });
    }
    return handleRouteError(error);
  }
}
