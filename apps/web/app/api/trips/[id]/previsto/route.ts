import { NextResponse } from "next/server";
import { z } from "zod";
import { lerPrevisto, salvarPrevisto } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * O PREVISTO DE UMA VIAGEM (2026-08-26, a pedido).
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `assign_resources`, a mesma chave de quem atribui — e é a mesma pessoa: prever é o passo anterior
 * a escalar. Uma permissão própria criaria um papel que a operação não tem.
 *
 * ── ISTO NÃO FALA COM O PORTAL, E É POR ISSO QUE EXISTE ───────────────────────────────────────
 *
 * Nenhuma ordem é enfileirada aqui. É a diferença inteira entre o previsto e a atribuição: um mora
 * só no TMS e se desfaz sem custo; a outra vai ao portal do cliente e não volta.
 *
 * Quem escreve a tela precisa manter isso visível — o dia em que os dois botões se parecerem, a
 * operação vai apertar o errado.
 */
const corpoSchema = z.object({
  /** O id do motorista NO PORTAL, a mesma chave do diálogo de atribuição. */
  portalDriverId: z.string().trim().max(64).nullish(),
  /** Cavalo, ou cavalo e carreta separados por vírgula — como o portal escreve. */
  placa: z.string().trim().max(64).nullish(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");
    const { id } = await params;
    return NextResponse.json({ previsto: await lerPrevisto(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Grava — ou DESMARCA, quando os dois campos vêm vazios.
 *
 * Não há DELETE separado de propósito: na tela, desmarcar é apagar os campos e salvar. Uma segunda
 * rota para o mesmo gesto seria um segundo caminho para o mesmo estado, e dois caminhos divergem.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");
    const { id } = await params;
    const corpo = corpoSchema.parse(await request.json().catch(() => ({})));

    const gravou = await salvarPrevisto(id, ctx.userId, {
      portalDriverId: corpo.portalDriverId ?? null,
      placa: corpo.placa ?? null,
    });

    // Devolve o previsto RELIDO, e não o que veio no corpo: o nome do motorista é resolvido no
    // banco, e a tela não deveria ter de traduzir o id por conta própria.
    return NextResponse.json({ previsto: gravou ? await lerPrevisto(id) : null });
  } catch (error) {
    return handleRouteError(error);
  }
}
