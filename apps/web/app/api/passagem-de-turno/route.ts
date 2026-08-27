import { NextResponse } from "next/server";
import { z } from "zod";
import { lerBloco, salvarNomes, setorDoUsuario } from "@brazil-tms/db";
import { setorValido } from "@brazil-tms/shared";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { exigirSetor, lerChave } from "@/lib/passagem-de-turno/guarda";

export const dynamic = "force-dynamic";

/**
 * A PASSAGEM DE TURNO — o bloco `(data, turno, setor)` (2026-08-26, a pedido).
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * LER: `view_all_trips` — os sete papéis internos. O diário existe para ser lido por quem entra no
 * turno, muitas vezes de outro setor.
 *
 * ESCREVER: a mesma permissão MAIS o setor da conta. É a regra que o usuário pediu — "só a pessoa
 * daquele setor vai poder editar" — e ela mora em `exigirSetor`, não espalhada por aqui.
 *
 * ── O BLOCO NÃO SE CRIA ───────────────────────────────────────────────────────────────────────
 *
 * Um `GET` de um dia que nunca foi escrito devolve o bloco vazio, criado na hora. Não há rota de
 * "gerar relatório do dia": na planilha isso é uma aba feita à mão, e é justamente por isso que só
 * existem oito dias lá.
 */

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");

    const chave = lerChave(new URL(request.url));
    if (!chave) {
      return NextResponse.json(
        { error: "Informe data (AAAA-MM-DD), turno (T1/T2) e setor." },
        { status: 400 },
      );
    }

    const bloco = await lerBloco(chave.data, chave.turno, chave.setor);
    /**
     * O setor da conta vai JUNTO com o bloco, e não numa chamada à parte.
     *
     * A tela precisa dele para decidir se desenha campos ou texto, e uma segunda chamada abriria a
     * janela em que a página aparece editável por um instante antes de travar — o tipo de piscada
     * que faz alguém começar a digitar e perder o que escreveu.
     */
    return NextResponse.json({ bloco, meuSetor: await setorDoUsuario(ctx.userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

const nomesSchema = z.object({
  setor: z.string(),
  blocoId: z.string().uuid(),
  assistente: z.string().trim().max(120).nullish(),
  supervisor: z.string().trim().max(120).nullish(),
});

/** Os dois nomes da faixa — assistente e supervisor. */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");

    const corpo = nomesSchema.parse(await request.json());
    const setor = setorValido(corpo.setor);
    if (!setor) return NextResponse.json({ error: "Setor desconhecido." }, { status: 400 });
    await exigirSetor(ctx, setor);

    const gravou = await salvarNomes(
      corpo.blocoId,
      { assistente: corpo.assistente, supervisor: corpo.supervisor },
      ctx.userId,
    );
    // Não gravar aqui não é erro de servidor: é o turno já entregue. A tela diz isso e recarrega.
    if (!gravou) {
      return NextResponse.json(
        { error: "Este turno já foi entregue e não aceita edição." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
