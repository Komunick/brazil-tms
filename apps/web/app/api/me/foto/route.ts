import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { guardarFoto } from "@/lib/perfil/foto";
import { lerArquivoDaFoto } from "@/lib/perfil/upload";

export const dynamic = "force-dynamic";

/**
 * A PRÓPRIA foto — sem exigir permissão nenhuma além de estar autenticado (FR-019).
 *
 * Não é dado da operação: é o rosto de quem está pedindo, sobre si mesmo. `requireAuth` já responde
 * a única pergunta que importa aqui — quem é você —, e o id vem da SESSÃO, nunca do corpo. Não
 * existe caminho para alguém trocar a foto de outra pessoa por esta rota.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    const arquivo = await lerArquivoDaFoto(request);
    await guardarFoto(ctx.userId, arquivo, ctx.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
