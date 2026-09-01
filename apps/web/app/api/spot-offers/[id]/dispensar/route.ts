import { NextResponse } from "next/server";
import { dispensarOferta } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * POST /api/spot-offers/:id/dispensar — tirar esta oferta da MINHA tela (2026-09-01).
 *
 * ── O QUE ELA NÃO FAZ, e cada uma é deliberada ────────────────────────────────────────────────
 *
 * NÃO manda nada ao portal. Ignorar não é rejeitar: rejeitar exige um motivo do vocabulário do
 * portal e é outra decisão, com outra tela. Aqui não sai ordem nenhuma.
 *
 * NÃO mexe na tela de ninguém. A oferta continua com os colegas até alguém aceitar — é o que impede
 * uma pessoa de esconder da equipe uma oferta que talvez interessasse a outra.
 *
 * NÃO remove nada. A oferta continua inteira na tabela dela e continua no registro do dia, onde a
 * linha aparece assinalada como ignorada e ainda pode ser aceita.
 *
 * ── A PERMISSÃO É A DA LEITURA, e não a do aceite ─────────────────────────────────────────────
 *
 * `view_all_trips`, a mesma de `GET /api/spot-offers`. Dispensar é um gesto sobre a própria tela, não
 * sobre o frete: quem pode ver a oferta pode limpar a própria vista. Exigir a permissão de aceitar
 * deixaria quem só olha sem como tirar da frente um cartão que não vai decidir.
 *
 * ── E NÃO EXISTE O INVERSO ────────────────────────────────────────────────────────────────────
 *
 * Não há rota para desfazer. O caminho de volta é o Painel do dia, onde a linha continua listada.
 *
 * 204, e idempotente: dispensar duas vezes responde igual. Quem dispensa é quem está autenticado, e
 * o corpo é vazio de propósito — não há como dispensar em nome de outra pessoa.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    const { id } = await params;
    await dispensarOferta(id, ctx.userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
