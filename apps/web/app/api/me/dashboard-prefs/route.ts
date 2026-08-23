import { NextResponse } from "next/server";
import { dashboardPrefsSchema } from "@brazil-tms/shared";
import { readDashboardPrefs, writeDashboardPrefs } from "@brazil-tms/db";
import { requireAuth } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * O painel de cada usuário (2026-08-23, a pedido) — quais cartões ele escondeu e quais deixou
 * encolhidos.
 *
 * SEM CHAVE DE PERMISSÃO, de propósito. Isto não é dado da operação: é a preferência de tela de
 * quem está pedindo, sobre si mesmo. `requireAuth` já responde a única pergunta que importa — quem
 * é você —, e o `userId` vem da sessão, nunca do corpo da requisição: não existe caminho para uma
 * pessoa ler ou escrever o painel de outra.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    return NextResponse.json(await readDashboardPrefs(ctx.userId));
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PUT (e não PATCH): a tela manda o estado final e ele substitui o guardado. Ver
 * `writeDashboardPrefs` para o porquê de não haver `add`/`remove`.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    const entrada = dashboardPrefsSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await writeDashboardPrefs(ctx.userId, entrada));
  } catch (error) {
    return handleRouteError(error);
  }
}
