import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { perfilDeAlguem } from "@/lib/perfil/perfil";

export const dynamic = "force-dynamic";

/**
 * O QUE O MINI PERFIL MOSTRA — para qualquer pessoa autenticada.
 *
 * ── O QUE ELE NÃO DEVOLVE, E ISSO É A DECISÃO ─────────────────────────────────────────────────
 *
 * Não devolve e-mail nem a lista de capacidades. O cartão responde "quem é essa pessoa e o que ela
 * faz", não "o que ela consegue alcançar" — e uma tela que qualquer um abre não é lugar de expor o
 * mapa de acesso da empresa. Quem precisa dele é quem administra usuários, e tem tela própria.
 *
 * O CARGO aparece porque é o que responde a pergunta que o cartão existe para responder: com quem eu
 * falo sobre isto. "Despachante" diz isso; a lista de 23 chaves, não.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await params;
    const perfil = await perfilDeAlguem(id);
    if (!perfil) return NextResponse.json({ erro: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json(perfil);
  } catch (error) {
    return handleRouteError(error);
  }
}
