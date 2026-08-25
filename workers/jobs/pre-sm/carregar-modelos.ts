import { type PgBoss } from "pg-boss";
import type { PreSmCarregarModelosPayload } from "@brazil-tms/shared";
import { proporCorrespondencias } from "@brazil-tms/shared";
import { gravarPropostasDeModelo, rotasParaCorrespondencia } from "@brazil-tms/db";
import { JOB, work } from "../../lib/queue";
import { credenciaisDaIntegra, getModelosPreSM } from "../../lib/integra/cliente";

/**
 * CARREGAR AS CORRESPONDÊNCIAS ROTA → MODELO (2026-08-25, fatia 026).
 *
 * É a peça que enche a tela de conferência. Sem ela, a tela abre vazia e não existe caminho para
 * preenchê-la — a carga estava escrita e testada, mas nada a chamava.
 *
 * ── NÃO GASTA NADA, E ISSO É O PONTO ──────────────────────────────────────────────────────────
 *
 * A gerenciadora cobra por SOLICITAÇÃO, não por consulta. `getModelosPreSM` é leitura pura: este
 * job pode rodar quantas vezes quiserem, inclusive com a integração desligada, sem custo e sem
 * criar nada lá. É por isso que ele não olha `INTEGRA_PRE_SM_ATIVO` — esse interruptor governa a
 * criação de Pré-SM, e amarrar a carga a ele impediria justamente o trabalho de preparação que
 * precisa acontecer ANTES de alguém ligar a criação.
 *
 * ── PROPÕE, NUNCA CONFIRMA ────────────────────────────────────────────────────────────────────
 *
 * Toda linha nasce com `confirmado_em` nulo, e só linha confirmada cria Pré-SM. O casamento é por
 * nome de estação e, quando erra, erra apontando para OUTRA rota — escolta contratada para um
 * trajeto que o caminhão não vai fazer. Uma carga que confirmasse sozinha transformaria um erro de
 * normalização em gasto silencioso.
 *
 * ── REPETIR É SEGURO ──────────────────────────────────────────────────────────────────────────
 *
 * A gravação é `DO NOTHING` em conflito: rodar de novo não desfaz conferência de ninguém nem
 * duplica linha. O que muda entre rodadas é só o que ENTRA — rota nova, ou modelo novo cadastrado
 * lá que passa a casar com uma rota que antes ficava de fora.
 */
export async function runPreSmCarregarModelos(
  payload: PreSmCarregarModelosPayload,
): Promise<void> {
  const inicio = Date.now();

  const cred = credenciaisDaIntegra();
  if (!cred) {
    /**
     * Sem credencial não há o que consultar, e o certo é dizer alto.
     *
     * Este é o caso REAL do dia em que isto foi escrito: as variáveis ainda não estão na VM. Falhar
     * em silêncio deixaria a tela vazia com a pessoa achando que o casamento não encontrou nada —
     * que é uma conclusão errada sobre o cadastro dela, não sobre a nossa configuração.
     */
    console.error(JSON.stringify({ job: JOB.preSmCarregarModelos, semCredencial: true }));
    throw new Error("sem credencial da Integra para consultar os modelos de Pré-SM");
  }

  const modelos = await getModelosPreSM(cred);
  const rotas = await rotasParaCorrespondencia(payload.diasParaTras);

  const propostas = proporCorrespondencias(
    rotas.map((r) => ({ origem: r.origem, destino: r.destino })),
    modelos.map((m) => ({ codigo: m.Codigo, descricao: m.Descricao ?? "" })),
  );

  const { novas } = await gravarPropostasDeModelo(propostas);

  /**
   * O log conta as TRÊS quantidades, e as três são perguntas diferentes.
   *
   * `rotas` sem `casaram` é o tamanho do trabalho de cadastro que sobra na gerenciadora; `casaram`
   * sem `novas` é o que já estava lá de uma rodada anterior. Registrar só "gravei N" deixaria
   * ambíguo se um número baixo significa cadastro completo ou casamento que falhou.
   */
  console.log(
    JSON.stringify({
      job: JOB.preSmCarregarModelos,
      pedidoPor: payload.pedidoPor,
      modelos: modelos.length,
      rotas: rotas.length,
      casaram: propostas.length,
      novas,
      durationMs: Date.now() - inicio,
    }),
  );
}

export async function registerPreSmCarregarModelos(boss: PgBoss): Promise<void> {
  await work(boss, JOB.preSmCarregarModelos, runPreSmCarregarModelos);
}
