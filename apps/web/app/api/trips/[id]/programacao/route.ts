import { NextResponse } from "next/server";
import { z } from "zod";
import {
  STATUS_DA_PROGRAMACAO,
  lerProgramacaoDaViagem,
  marcarStatus,
  salvarPrevisto,
} from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * O QUE A OPERAÇÃO DECIDIU SOBRE A VIAGEM — o previsto e o status (2026-08-26, a pedido).
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `assign_resources`, a mesma chave de quem atribui — e é a mesma pessoa: prever é o passo anterior
 * a escalar, e marcar "enviado" é dizer que escalou. Uma permissão própria criaria um papel que a
 * operação não tem.
 *
 * ── ISTO NÃO FALA COM O PORTAL, E É POR ISSO QUE EXISTE ───────────────────────────────────────
 *
 * Nenhuma ordem é enfileirada aqui. É a diferença inteira entre o previsto e a atribuição: um mora
 * só no TMS e se desfaz sem custo; a outra vai ao portal do cliente e não volta.
 *
 * Quem escrever a tela precisa manter isso visível — o dia em que os dois botões se parecerem, a
 * operação vai apertar o errado. Já aconteceu uma vez, em 25/08.
 */
const previstoSchema = z.object({
  /** O id do motorista NO PORTAL, a mesma chave do diálogo de atribuição. */
  portalDriverId: z.string().trim().max(64).nullish(),
  /** Cavalo, ou cavalo e carreta separados por vírgula — como o portal escreve. */
  placa: z.string().trim().max(64).nullish(),
});

/**
 * `null` TIRA o status, e não é um quinto valor.
 *
 * A tela manda `null` quando a pessoa clica de novo no que já estava marcado. Um valor "SEM_STATUS"
 * criaria duas formas de dizer ausência no banco, e a segunda sempre é a que alguém esquece de
 * tratar.
 */
const statusSchema = z.object({
  status: z.enum(STATUS_DA_PROGRAMACAO).nullable(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");
    const { id } = await params;
    return NextResponse.json({ programacao: await lerProgramacaoDaViagem(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Grava o previsto — ou o DESMARCA, quando os dois campos vêm vazios.
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
    const corpo = previstoSchema.parse(await request.json().catch(() => ({})));

    await salvarPrevisto(id, ctx.userId, {
      portalDriverId: corpo.portalDriverId ?? null,
      placa: corpo.placa ?? null,
    });

    // Devolve o estado RELIDO, e não o que veio no corpo: o nome do motorista é resolvido no banco,
    // e a tela não deveria ter de traduzir o id por conta própria.
    return NextResponse.json({ programacao: await lerProgramacaoDaViagem(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * O STATUS TEM VERBO PRÓPRIO, e não divide o PUT com o previsto.
 *
 * São dois gestos independentes na mesma linha do banco. Um PUT que recebesse os dois obrigaria a
 * tela a mandar o previsto toda vez que mudasse o status — e o dia em que ela mandasse um campo
 * ausente por engano apagaria a previsão de alguém, sem erro nenhum.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");
    const { id } = await params;
    const { status } = statusSchema.parse(await request.json().catch(() => ({})));

    await marcarStatus(id, ctx.userId, status);
    return NextResponse.json({ programacao: await lerProgramacaoDaViagem(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
