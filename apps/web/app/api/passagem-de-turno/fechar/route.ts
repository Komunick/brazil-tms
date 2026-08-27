import { NextResponse } from "next/server";
import { z } from "zod";
import { fecharBloco } from "@brazil-tms/db";
import { setorValido } from "@brazil-tms/shared";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { exigirSetor } from "@/lib/passagem-de-turno/guarda";

export const dynamic = "force-dynamic";

/**
 * ENTREGAR O TURNO — o gesto que fecha o bloco (2026-08-26).
 *
 * É o que dá sentido à seção "Ocorrências para o próximo turno": existe uma entrega. Depois disto o
 * bloco é somente-leitura e entra na linha do tempo.
 *
 * ── NÃO HÁ ROTA PARA REABRIR ──────────────────────────────────────────────────────────────────
 *
 * De propósito. Um turno reabrível é um turno que pode ser reescrito depois que alguém já leu e
 * agiu — e a leitura do turno anterior é justamente para onde este diário existe. Se um bloco foi
 * entregue cedo demais, o conserto é anotar no turno seguinte, que é o que a operação já faz hoje
 * na planilha.
 *
 * ── E O FECHAMENTO É IDEMPOTENTE ──────────────────────────────────────────────────────────────
 *
 * `fecharBloco` só grava com `fechado_em is null` na condição. Dois cliques seguidos, ou dois
 * supervisores apertando junto, não sobrescrevem quem entregou de verdade.
 */
const fecharSchema = z.object({
  setor: z.string(),
  blocoId: z.string().uuid(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");

    const corpo = fecharSchema.parse(await request.json());
    const setor = setorValido(corpo.setor);
    if (!setor) return NextResponse.json({ error: "Setor desconhecido." }, { status: 400 });
    await exigirSetor(ctx, setor);

    const fechou = await fecharBloco(corpo.blocoId, ctx.userId);
    if (!fechou) {
      return NextResponse.json({ error: "Este turno já havia sido entregue." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
