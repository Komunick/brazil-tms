import { type PgBoss } from "pg-boss";
import type { PreSmCancelarPayload } from "@brazil-tms/shared";
import { encerrarTentativaDePreSm, preSmPorId } from "@brazil-tms/db";
import { JOB, work } from "../../lib/queue";
import { credenciaisDaIntegra, IntegraRecusou, setCancelaPreSM } from "../../lib/integra/cliente";

/**
 * CANCELAR UMA PRÉ-SM criada por engano (2026-08-25, fatia 026).
 *
 * ── POR QUE ISTO NÃO É UM EXTRA ───────────────────────────────────────────────────────────────
 *
 * Não existe ambiente de homologação para nós (`CodErro 100`, medido). Toda criação acontece contra
 * o sistema real, e a gerenciadora cobra por solicitação. Este job é a **única forma de desfazer** —
 * é por isso que ele entra na mesma fatia da criação, e não numa seguinte.
 *
 * ── E POR QUE É JOB, E NÃO UMA CHAMADA DA ROTA ────────────────────────────────────────────────
 *
 * A credencial vive só no worker. Uma rota do app web que chamasse a Integra exigiria a senha de
 * produção dentro do Next, o que a constituição não permite.
 *
 * O efeito para quem clica: o botão PEDE, e o estado vira `cancelada` quando ela confirma. Honesto,
 * porque quem cancela de verdade é ela — mostrar "cancelada" no instante do clique seria mentira até
 * a resposta chegar.
 */
export async function runPreSmCancelar(payload: PreSmCancelarPayload): Promise<void> {
  const linha = await preSmPorId(payload.tripPreSmId);

  // Sem código não há o que cancelar lá: a Pré-SM nunca chegou a existir do lado dela. Encerrar
  // aqui é o certo — a linha some do estado vivo e a viagem volta a poder tentar.
  if (!linha) return;
  if (linha.status !== "criada" || !linha.codigo) {
    await encerrarTentativaDePreSm({ id: linha.id, status: "cancelada" });
    return;
  }

  const cred = credenciaisDaIntegra();
  if (!cred) {
    // Sem credencial não dá para cancelar lá, e marcar como cancelada aqui seria mentir: a Pré-SM
    // continuaria viva na gerenciadora, cobrada, e invisível para nós.
    console.warn(JSON.stringify({ job: JOB.preSmCancelar, semCredencial: linha.id }));
    throw new Error("sem credencial da Integra para cancelar");
  }

  try {
    await setCancelaPreSM(cred, Number(linha.codigo));
    await encerrarTentativaDePreSm({ id: linha.id, status: "cancelada" });
    console.log(JSON.stringify({ job: JOB.preSmCancelar, cancelada: linha.codigo }));
  } catch (e) {
    if (e instanceof IntegraRecusou) {
      /**
       * Ela recusou o cancelamento — tipicamente porque a Pré-SM já foi EFETIVADA por alguém do
       * lado de lá, e aí não é mais cancelável por este caminho.
       *
       * A linha continua `criada` e o motivo é gravado. Marcar como cancelada faria a tela mentir
       * sobre algo que continua ativo e cobrado.
       */
      await encerrarTentativaDePreSm({
        id: linha.id,
        status: "criada",
        codigo: linha.codigo,
        motivo: `cancelamento recusado — ${e.codErro}: ${e.msgErro}`,
      });
      console.warn(
        JSON.stringify({ job: JOB.preSmCancelar, recusouCancelar: e.codErro, id: linha.id }),
      );
      return;
    }
    throw e;
  }
}

export async function registerPreSmCancelar(boss: PgBoss): Promise<void> {
  await work(boss, JOB.preSmCancelar, runPreSmCancelar);
}
