import "server-only";
import { PRE_SM_JOBS, type PreSmCriarPayload } from "@brazil-tms/shared";
import { ordemDeAtribuicaoConcluida } from "@brazil-tms/db";
import { getBffBoss } from "@/lib/queue/boss";

/**
 * PEDIR A PRÉ-SM depois que o portal confirmou a atribuição (2026-08-25, fatia 026).
 *
 * Espelha `lib/billing/queue.ts`: o BFF publica, o worker drena a mesma fila Postgres. O trabalho
 * pesado — e neste caso a chamada a sistema de terceiro — fica fora do caminho da requisição.
 *
 * ── SÓ ORDEM DE ATRIBUIÇÃO ────────────────────────────────────────────────────────────────────
 *
 * A rota que chama isto encerra ordens de aceite, recusa E atribuição. Só a última gera Pré-SM, e a
 * verificação mora aqui, não lá: quem escreve a rota não deveria precisar saber que aceitar não
 * pede escolta.
 */
export async function enfileirarPreSmSePrecisar(portalCommandId: string): Promise<void> {
  const ordem = await ordemDeAtribuicaoConcluida(portalCommandId);
  if (!ordem) return;

  const boss = await getBffBoss();
  const payload: PreSmCriarPayload = { tripId: ordem.tripId, portalCommandId };
  await boss.send(PRE_SM_JOBS.preSmCriar, payload as object);
}
