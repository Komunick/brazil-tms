import { NextResponse } from "next/server";
import { PRE_SM_JOBS, type PreSmCriarPayload } from "@brazil-tms/shared";
import { linhaDaFilaGR, registrarPedidoDeEnvio } from "@brazil-tms/db";
import { getBffBoss } from "@/lib/queue/boss";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { Conflict, NotFound, handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * PEDIR A PRÉ-SM de uma viagem (2026-08-26, fatia 027).
 *
 * ── ENFILEIRA, NÃO CHAMA ──────────────────────────────────────────────────────────────────────
 *
 * A credencial da gerenciadora vive **só no worker** — o cliente dela mora em `workers/lib/`, fora
 * de `packages/`, exatamente para o app web não conseguir importá-lo. Uma rota que chamasse a
 * Integra exigiria a senha de produção dentro do Next, e a constituição não permite.
 *
 * Devolve **202**: ACEITO, não FEITO. A Pré-SM existe quando a gerenciadora responder, e dizer
 * "criada" no instante do clique seria mentira até lá.
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `assign_resources`, a mesma chave de quem atribui. É a mesma pessoa: a Pré-SM nasce da atribuição
 * que ela fez.
 *
 * ── A RECUSA ACONTECE AQUI, COM A MESMA REGRA DA TELA ─────────────────────────────────────────
 *
 * A tela já trava o botão, mas tela não é garantia: quem manteve a página aberta desde antes de a
 * correspondência ser desfeita ainda tem o botão disponível. A verificação real usa a MESMA fonte
 * (`linhaDaFilaGR`) e a mesma função pura que o worker vai usar.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");
    const { tripId } = await params;

    const linha = await linhaDaFilaGR(tripId);
    if (!linha) throw new NotFound("NOT_FOUND", "Esta viagem não está na fila de GR.");

    // Já existe uma viva: `criada` ou `pendente`. Pedir de novo criaria uma segunda solicitação
    // cobrada — o índice único parcial é a garantia final, mas recusar aqui evita a ida à fila.
    if (linha.preSmStatus === "criada" || linha.preSmStatus === "pendente") {
      throw new Conflict("JA_EXISTE", "Esta viagem já tem uma Pré-SM ativa.");
    }

    /**
     * Quem apertou fica registrado AQUI, e não no worker (FR-009).
     *
     * O worker sabe o que aconteceu; ele não sabe quem quis. E é essa a informação que alguém vai
     * procurar no dia em que a gerenciadora cobrar por uma solicitação de que ninguém se lembra.
     */
    await registrarPedidoDeEnvio({ tripId, actorUserId: ctx.userId });

    const boss = await getBffBoss();
    const payload: PreSmCriarPayload = { tripId, portalCommandId: "" };
    await boss.send(PRE_SM_JOBS.preSmCriar, payload as object);

    return NextResponse.json({ pedido: true }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
