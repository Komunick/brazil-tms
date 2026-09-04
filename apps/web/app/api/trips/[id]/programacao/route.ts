import { NextResponse } from "next/server";
import { z } from "zod";
import {
  STATUS_DA_PROGRAMACAO,
  lerProgramacaoDaViagem,
  marcarStatus,
  marcarSm,
  marcarCte,
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

/**
 * A SM da linha (2026-08-31) — três estados, e o `null` é um deles.
 *
 * `true` = emitida · `false` = NÃO emitida, que é uma afirmação de quem olhou · `null` = tirar a
 * marcação, voltando ao "ninguém disse nada".
 *
 * O campo é OPCIONAL no esquema porque este corpo divide o verbo com o do status: a ausência é o que
 * distingue os dois gestos. `undefined` quer dizer "esta requisição não é sobre a SM".
 */
const smSchema = z.object({
  sm: z.boolean().nullable().optional(),
});

/**
 * O CTE — a terceira marcação, e o mesmo desenho da SM (2026-09-04, a pedido).
 *
 * `undefined` quer dizer "esta requisição não é sobre o CTE", que é o que permite os três gestos
 * dividirem o mesmo PATCH sem cada um precisar saber dos outros.
 */
const cteSchema = z.object({
  cte: z.boolean().nullable().optional(),
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
    /*
      O CORPO É LIDO UMA VEZ SÓ — `request.json()` consome o fluxo, e uma segunda chamada devolve
      erro. Lido aqui, decidido abaixo.

      ── O MESMO VERBO SERVE AOS DOIS GESTOS ─────────────────────────────────────────────────────

      Um PATCH por campo (`/status` e `/sm`) daria duas rotas quase idênticas para dois cliques
      irmãos na mesma linha. O corpo traz `status` OU `sm`, nunca os dois: mandar os dois obrigaria a
      tela a saber do outro campo ao mexer num só, que é exatamente o defeito descrito acima sobre o
      previsto.
    */
    const corpo: unknown = await request.json().catch(() => ({}));

    const comSm = smSchema.safeParse(corpo);
    if (comSm.success && comSm.data.sm !== undefined) {
      await marcarSm(id, ctx.userId, comSm.data.sm);
      return NextResponse.json({ programacao: await lerProgramacaoDaViagem(id) });
    }

    const comCte = cteSchema.safeParse(corpo);
    if (comCte.success && comCte.data.cte !== undefined) {
      await marcarCte(id, ctx.userId, comCte.data.cte);
      return NextResponse.json({ programacao: await lerProgramacaoDaViagem(id) });
    }

    const { status } = statusSchema.parse(corpo);
    await marcarStatus(id, ctx.userId, status);
    return NextResponse.json({ programacao: await lerProgramacaoDaViagem(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
