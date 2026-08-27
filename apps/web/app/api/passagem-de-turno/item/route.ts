import { NextResponse } from "next/server";
import { z } from "zod";
import { removerItem, salvarItem } from "@brazil-tms/db";
import { setorValido } from "@brazil-tms/shared";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { exigirSetor } from "@/lib/passagem-de-turno/guarda";

export const dynamic = "force-dynamic";

/**
 * O ITEM — uma ocorrência anotada numa seção (2026-08-26).
 *
 * ── O CONTEÚDO É CONFERIDO CONTRA O CATÁLOGO, NÃO CONTRA UM SCHEMA FIXO ───────────────────────
 *
 * `dados` chega como pares chave/valor de texto e o Zod só garante essa forma. Quem confere os
 * CAMPOS é `problemasDoItem`, dentro de `salvarItem`, porque a resposta depende da seção — e as 16
 * seções têm colunas diferentes. Um schema por seção aqui seria o catálogo declarado duas vezes,
 * e as duas divergiriam na primeira mudança.
 *
 * A conferência devolve TODOS os problemas, não o primeiro: quem preencheu um cartão de seis
 * campos merece saber os três que faltam de uma vez.
 */
const itemSchema = z.object({
  setor: z.string(),
  blocoId: z.string().uuid(),
  itemId: z.string().uuid().nullish(),
  secao: z.string().min(1).max(64),
  ordem: z.number().int().min(0).max(9999).optional(),
  /**
   * Tudo texto, inclusive valor e data.
   *
   * A planilha aceita `16:30`, `25/08/2026 21:30:00` e `25/08/2026 20h30` na MESMA coluna — os três
   * aparecem no arquivo de 25/08. Normalizar isso na entrada recusaria o que a operação escreve
   * hoje, e o campo simplesmente deixaria de ser preenchido. O texto preserva o que a pessoa quis
   * dizer; apertar o formato é decisão para depois, com a operação junto.
   */
  dados: z.record(z.string().max(2000)),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");

    const corpo = itemSchema.parse(await request.json());
    const setor = setorValido(corpo.setor);
    if (!setor) return NextResponse.json({ error: "Setor desconhecido." }, { status: 400 });
    await exigirSetor(ctx, setor);

    const r = await salvarItem(
      {
        blocoId: corpo.blocoId,
        itemId: corpo.itemId,
        setor,
        secao: corpo.secao,
        dados: corpo.dados,
        ordem: corpo.ordem,
      },
      ctx.userId,
    );

    if (!r.ok) return NextResponse.json({ problemas: r.problemas }, { status: 400 });
    return NextResponse.json({ id: r.id });
  } catch (error) {
    return handleRouteError(error);
  }
}

const removerSchema = z.object({
  setor: z.string(),
  blocoId: z.string().uuid(),
  itemId: z.string().uuid(),
});

/**
 * Remove um item — de verdade, e não marcando.
 *
 * Enquanto o turno está aberto o item é RASCUNHO, e some por engano de digitação. Depois de
 * entregue nada é removido: `removerItem` recusa, porque o bloco fechado recusa toda escrita.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");

    const corpo = removerSchema.parse(await request.json());
    const setor = setorValido(corpo.setor);
    if (!setor) return NextResponse.json({ error: "Setor desconhecido." }, { status: 400 });
    await exigirSetor(ctx, setor);

    const removeu = await removerItem(corpo.itemId, corpo.blocoId);
    if (!removeu) {
      return NextResponse.json(
        { error: "O item não existe mais, ou o turno já foi entregue." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
