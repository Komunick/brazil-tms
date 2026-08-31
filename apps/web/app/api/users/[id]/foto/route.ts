import { NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { fotoAtual, guardarFoto, urlDaFoto } from "@/lib/perfil/foto";
import { lerArquivoDaFoto } from "@/lib/perfil/upload";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * A foto de QUALQUER pessoa — redireciona para um link de curta duração (FR-022).
 *
 * Basta estar autenticado para VER: o cartão do mini perfil abre para qualquer um, e é ele que
 * responde "quem é essa pessoa". Trocar é outra história, e está no PUT abaixo.
 *
 * 404 quando não há foto, e não uma imagem padrão: quem desenha o "sem foto" é a tela, com as
 * iniciais (FR-020). Devolver um placeholder daqui faria a tela mostrar o mesmo desenho para todos.
 */
export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await params;
    const foto = await fotoAtual(id);
    if (!foto) return NextResponse.json({ erro: "SEM_FOTO" }, { status: 404 });
    return NextResponse.redirect(await urlDaFoto(foto.fileStorageKey));
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Trocar a foto de outra pessoa exige `manage_users` — quem administra usuários. */
export async function PUT(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_users");
    const { id } = await params;
    const arquivo = await lerArquivoDaFoto(request);
    await guardarFoto(id, arquivo, ctx.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
