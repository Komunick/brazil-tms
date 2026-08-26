import { NextResponse } from "next/server";
import { z } from "zod";
import { apagarComentario, comentar, listarComentarios } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { NotFound, handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * OS COMENTÁRIOS DE UMA VIAGEM (2026-08-26, a pedido).
 *
 * ── QUEM PODE: `view_all_trips`, e de propósito a mesma chave para LER e ESCREVER ─────────────
 *
 * O comentário existe para o turno seguinte saber o que o anterior sabia. Uma permissão de escrita
 * mais estreita que a de leitura criaria gente que lê o recado e não pode responder — que é
 * exatamente quem costuma ter a informação que falta.
 *
 * ── APAGAR É SÓ DO AUTOR, E A REGRA NÃO MORA AQUI ─────────────────────────────────────────────
 *
 * A condição de dono viaja dentro do `where` de `apagarComentario`. É deliberado: um `if` nesta
 * rota protegeria esta rota, e a próxima que alguém escrever começaria desprotegida.
 */
const novoSchema = z.object({
  texto: z.string().trim().min(1, "Escreva alguma coisa.").max(2000),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    const { id } = await params;
    return NextResponse.json({ itens: await listarComentarios(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    const { id } = await params;
    const { texto } = novoSchema.parse(await request.json().catch(() => ({})));
    await comentar(id, ctx.userId, texto);
    // Devolve a LISTA inteira, não o item criado: a tela mostra a conversa, e um item solto a
    // obrigaria a recarregar logo em seguida — duas idas ao servidor para um comentário.
    return NextResponse.json({ itens: await listarComentarios(id) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    const { id } = await params;
    const comentarioId = new URL(request.url).searchParams.get("comentario") ?? "";

    const apagou = await apagarComentario(comentarioId, ctx.userId);
    /**
     * A MESMA RESPOSTA para "não existe" e "não é seu".
     *
     * Distinguir as duas contaria a quem tentou que o comentário existe e é de outra pessoa — uma
     * informação que ninguém precisa e que só serve para descobrir o que não se pode ver.
     */
    if (!apagou) throw new NotFound("NOT_FOUND", "Comentário não encontrado.");

    return NextResponse.json({ itens: await listarComentarios(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
