import { NextResponse } from "next/server";
import {
  divergenciasDaPreSm,
  PRE_SM_JOBS,
  type PreSmCancelarPayload,
} from "@brazil-tms/shared";
import {
  preSmComAtribuicaoAtual,
  preSmDaViagem,
  registrarPedidoDeCancelamento,
} from "@brazil-tms/db";
import { getBffBoss } from "@/lib/queue/boss";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { Conflict, NotFound, handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * O ESTADO DA PRÉ-SM DE UMA VIAGEM, e o pedido de cancelamento (2026-08-25, fatia 026).
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `assign_resources` — a mesma chave de quem atribui. É a mesma pessoa: a Pré-SM nasce da
 * atribuição que ela fez, e desfazê-la é parte de refazer a escala.
 *
 * ── O CANCELAMENTO PEDE, NÃO CANCELA ──────────────────────────────────────────────────────────
 *
 * Quem cancela de verdade é a gerenciadora, e a credencial dela vive só no worker. Esta rota
 * enfileira o trabalho e devolve 202: o estado vira `cancelada` quando ela confirmar.
 *
 * Mostrar "cancelada" no instante do clique seria mentira até a resposta chegar — e mentira sobre
 * algo que continua ativo e cobrado.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");
    const { id } = await params;
    const { preSm, payloadEnviado, atual } = await preSmComAtribuicaoAtual(id);
    /**
     * A DIVERGÊNCIA É CALCULADA AQUI, não guardada (FR-018).
     *
     * Ela muda toda vez que alguém reatribui a viagem, e uma coluna com "está divergente" ficaria
     * velha no instante seguinte — precisaria de alguém para recalculá-la, e esse alguém não existe.
     *
     * Só interessa quando a Pré-SM EXISTE de verdade lá: uma `sem_dados` não descreve ninguém, e
     * dizer que ela diverge seria um aviso sobre nada.
     */
    const divergencias =
      preSm?.status === "criada" ? divergenciasDaPreSm(payloadEnviado, atual) : [];
    return NextResponse.json({ preSm, divergencias });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");
    const { id } = await params;

    const atual = await preSmDaViagem(id);
    if (!atual) throw new NotFound("NOT_FOUND", "Esta viagem não tem Pré-SM.");
    // Só faz sentido cancelar o que existe lá. `pendente` ainda não virou nada; `recusada`,
    // `sem_dados` e `cancelada` já estão encerradas.
    if (atual.status !== "criada") {
      throw new Conflict("NAO_CANCELAVEL", "Só uma Pré-SM criada pode ser cancelada.");
    }

    // A auditoria fica aqui, no PEDIDO, e não no worker: quem pediu é gente, e é essa a informação
    // que alguém vai procurar. O worker sabe o que aconteceu, não quem quis.
    await registrarPedidoDeCancelamento({ tripId: id, preSmId: atual.id, actorUserId: ctx.userId });

    const boss = await getBffBoss();
    const payload: PreSmCancelarPayload = { tripPreSmId: atual.id, actorUserId: ctx.userId };
    await boss.send(PRE_SM_JOBS.preSmCancelar, payload as object);

    return NextResponse.json({ pedido: true }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
