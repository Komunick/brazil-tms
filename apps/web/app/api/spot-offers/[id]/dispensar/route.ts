import { NextResponse } from "next/server";
import { dispensarOferta } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { dispensarBodySchema } from "@brazil-tms/shared";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * POST /api/spot-offers/:id/dispensar — a equipe decide não pegar esta oferta (2026-09-01).
 *
 * ── ELA JÁ FOI PESSOAL, e o comentário abaixo ficou dias descrevendo o que ela não era mais ────
 *
 * Nasceu como "tirar da MINHA tela": uma linha por (pessoa, oferta), e a oferta continuava com os
 * colegas. O usuário inverteu no mesmo dia — ignorar passou a valer para todos, porque o contrário
 * fazia cada pessoa ter de recusar o mesmo cartão. A migração 0063 encolheu a chave para a oferta.
 *
 * ── O QUE ELA NÃO FAZ, e cada uma é deliberada ────────────────────────────────────────────────
 *
 * NÃO manda nada ao portal. Ignorar não é rejeitar: rejeitar exige um motivo do vocabulário do
 * portal e é outra decisão, com outra tela. Aqui não sai ordem nenhuma.
 *
 * NÃO remove nada. A oferta continua inteira na tabela dela e continua no registro do dia, onde a
 * linha aparece assinalada com QUEM ignorou e o motivo, e ainda pode ser aceita.
 *
 * ── A PERMISSÃO É `decidir_spot`, e é a mesma do aceite ───────────────────────────────────────
 *
 * Enquanto a dispensa era pessoal, a permissão certa era a da LEITURA (`view_all_trips`): limpar a
 * própria vista não é decidir sobre o frete. Ao virar decisão da equipe, ela passou a apagar o
 * cartão da tela de todo mundo — e isso é decidir sobre o frete. Quem só olha não pode fazê-lo.
 *
 * ── E NÃO EXISTE O INVERSO ────────────────────────────────────────────────────────────────────
 *
 * Não há rota para desfazer. O caminho de volta é o Painel do dia, onde a linha continua listada.
 *
 * 204, e idempotente: dispensar duas vezes responde igual. Quem dispensa é quem está autenticado, e
 * o corpo é vazio de propósito — não há como dispensar em nome de outra pessoa.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "decidir_spot");
    const { id } = await params;
    /*
      O corpo pode vir vazio: o motivo é opcional, e quem ignora sem escrever nada não manda corpo
      nenhum. O `catch` cobre isso — `request.json()` lança em corpo vazio, e um erro de parse aqui
      viraria uma falha para um caso que é o mais comum.
    */
    const corpo = dispensarBodySchema.parse(await request.json().catch(() => ({})));
    await dispensarOferta(id, ctx.userId, corpo.motivo ?? null);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
