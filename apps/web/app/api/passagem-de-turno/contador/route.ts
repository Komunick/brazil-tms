import { NextResponse } from "next/server";
import { z } from "zod";
import { salvarContador } from "@brazil-tms/db";
import { contadoresDo, setorValido, turnoValido } from "@brazil-tms/shared";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { exigirSetor } from "@/lib/passagem-de-turno/guarda";

export const dynamic = "force-dynamic";

/**
 * UM CONTADOR DO RESUMO DA OPERAÇÃO (2026-08-26).
 *
 * ── `valor` É TEXTO, E NÃO NÚMERO ─────────────────────────────────────────────────────────────
 *
 * Contrariando o instinto, e por prova: na planilha de 25/08 o "Bloqueios" do GR está com `-` e o
 * "ON TIME" do Monitoring com `x`. São respostas legítimas — "não se aplica", "não medi" — e um
 * número recusaria as duas, obrigando a inventar zero. Zero afirma outra coisa, e num resumo de
 * turno a diferença importa.
 *
 * ── UM CALCULADO TAMBÉM ACEITA VALOR DIGITADO ─────────────────────────────────────────────────
 *
 * Quem está no turno pode saber de algo que o banco ainda não viu. Quando isso acontece o digitado
 * vale e a tela mostra os dois, com o do sistema riscado ao lado. Recusar o override esconderia a
 * divergência em vez de resolvê-la — e um resumo que discorda do banco em silêncio é pior que
 * resumo nenhum.
 */
const contadorSchema = z.object({
  setor: z.string(),
  turno: z.string(),
  blocoId: z.string().uuid(),
  chave: z.string().min(1).max(64),
  /** Vazio APAGA o valor digitado — é como se desfaz um override, e não precisa de rota própria. */
  valor: z.string().max(32),
});

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");

    const corpo = contadorSchema.parse(await request.json());
    const setor = setorValido(corpo.setor);
    const turno = turnoValido(corpo.turno);
    if (!setor || !turno) {
      return NextResponse.json({ error: "Setor ou turno desconhecido." }, { status: 400 });
    }
    await exigirSetor(ctx, setor);

    /**
     * A CHAVE PRECISA EXISTIR NO RESUMO DAQUELE BLOCO.
     *
     * Sem esta conferência, um erro de digitação no cliente gravaria `no_shwo` — e a linha entraria
     * na tabela sem que nada acusasse, porque a tabela não tem lista de chaves. O número
     * desapareceria da tela e ninguém saberia por quê.
     *
     * A conferência é por `(setor, turno)` e não só por setor, porque o resumo do GR difere entre
     * os dois turnos: `bloqueios` existe no T1 e `desbloqueios` no T2.
     */
    const conhecida = contadoresDo(setor, turno).some((c) => c.chave === corpo.chave);
    if (!conhecida) {
      return NextResponse.json(
        { error: `O resumo de ${setor}/${turno} não tem o contador "${corpo.chave}".` },
        { status: 400 },
      );
    }

    const gravou = await salvarContador(corpo.blocoId, corpo.chave, corpo.valor, ctx.userId);
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
