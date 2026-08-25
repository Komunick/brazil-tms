import { type PgBoss } from "pg-boss";
import type { OwnershipType, PreSmCriarPayload } from "@brazil-tms/shared";
import {
  abrirTentativaDePreSm,
  contarTentativa,
  criadasHoje,
  dadosDaPreSm,
  encerrarTentativaDePreSm,
  modeloConfirmadoDaRota,
} from "@brazil-tms/db";
import { JOB, work } from "../../lib/queue";
import {
  credenciaisDaIntegra,
  IntegraIndisponivel,
  IntegraRecusou,
  setPreSMdeModelo,
} from "../../lib/integra/cliente";
import { chaveDaRota, decidir } from "./criar";

/**
 * CRIAR A PRÉ-SM NA GERENCIADORA quando a atribuição volta confirmada do portal (2026-08-25, 026).
 *
 * A decisão — criar ou não, e o que mandar — é pura e vive em `criar.ts`, sob teste. Aqui está o
 * que não dá para testar sem o mundo: buscar, chamar e gravar.
 *
 * ── NASCE DESLIGADO, E ISSO NÃO É CAUTELA GENÉRICA ────────────────────────────────────────────
 *
 * A gerenciadora **cobra por solicitação** e não tem ambiente de homologação para nós (`CodErro
 * 100`, medido em 25/08). Toda escrita acontece contra o sistema real.
 *
 * Com `INTEGRA_PRE_SM_ATIVO` diferente de `true`, este job roda inteiro — busca, decide, monta o
 * corpo — e grava em `trip_pre_sm.payload_enviado` o que TERIA mandado, sem chamar ninguém. É assim
 * que se confere a feature por dias antes de ela custar o primeiro centavo.
 *
 * O teto diário começa em zero: mesmo ligada, ela não cria nada até alguém subir o número. A
 * primeira criação é um ato deliberado, não efeito de um deploy.
 *
 * ── UMA TENTATIVA POR VIAGEM, GARANTIDA PELO BANCO ────────────────────────────────────────────
 *
 * `abrirTentativaDePreSm` devolve `null` quando o índice único parcial recusa — significa que já
 * existe uma viva. Não é erro: é o reprocesso da fila encontrando o trabalho já feito. Duas Pré-SM
 * para a mesma viagem seriam escolta cobrada em dobro.
 */
export async function runPreSmCriar(payload: PreSmCriarPayload): Promise<void> {
  const inicio = Date.now();
  const dados = await dadosDaPreSm(payload.portalCommandId);

  if (!dados) {
    // Ordem que não é de atribuição, ou que sumiu. Não há o que criar, e não é falha.
    console.log(JSON.stringify({ job: JOB.preSmCriar, semOrdem: payload.portalCommandId }));
    return;
  }

  const { origemNorm, destinoNorm } = chaveDaRota(dados.origem, dados.destino);
  const codModelo = await modeloConfirmadoDaRota(origemNorm, destinoNorm);

  const desfecho = decidir(
    {
      codModelo,
      cpfMotorista: dados.cpfMotorista,
      vinculoMotorista: dados.vinculoMotorista as OwnershipType | null,
      cpfSegundoMotorista: dados.cpfSegundoMotorista,
      vinculoSegundoMotorista: dados.vinculoSegundoMotorista as OwnershipType | null,
      placas: dados.placas.map((p) => ({
        placa: p.placa,
        vinculo: p.vinculo as OwnershipType | null,
      })),
      chegadaNaColeta: dados.chegadaNaColeta,
      saidaDaColeta: dados.saidaDaColeta,
    },
    {
      ativo: process.env.INTEGRA_PRE_SM_ATIVO === "true",
      tetoDiario: Number(process.env.INTEGRA_PRE_SM_TETO_DIARIO ?? 0) || 0,
      criadasHoje: await criadasHoje(),
      temCredencial: credenciaisDaIntegra() != null,
    },
  );

  /**
   * A LINHA NASCE MESMO QUANDO NÃO SE CRIA NADA, e é isso que faz a tela poder dizer por quê.
   *
   * Sem ela, uma viagem sem CPF ficaria idêntica a uma viagem que ninguém processou — e o silêncio
   * é exatamente o desfecho que esta fatia existe para evitar.
   */
  const tentativa = await abrirTentativaDePreSm({
    tripId: dados.tripId,
    codModelo,
    payloadEnviado: desfecho.tipo === "nao_criar" ? null : desfecho.corpo,
  });

  if (!tentativa) {
    // O índice único recusou: já existe uma viva. O reprocesso encontrou o trabalho feito.
    console.log(JSON.stringify({ job: JOB.preSmCriar, tripId: dados.tripId, jaExistia: true }));
    return;
  }

  if (desfecho.tipo === "nao_criar") {
    await encerrarTentativaDePreSm({
      id: tentativa.id,
      status: "sem_dados",
      motivo: desfecho.motivo,
    });
    console.log(
      JSON.stringify({
        job: JOB.preSmCriar,
        tripId: dados.tripId,
        naoCriou: desfecho.motivo,
        durationMs: Date.now() - inicio,
      }),
    );
    return;
  }

  if (desfecho.tipo === "desligado" || desfecho.tipo === "teto_atingido") {
    /**
     * Fica `pendente`, e não `sem_dados`.
     *
     * A diferença importa: `sem_dados` é "falta coisa nossa, alguém precisa agir"; `pendente` é
     * "está tudo pronto, esperando autorização". A tela conta os dois separado, e é o segundo
     * número que responde "quantas nasceriam se eu ligasse".
     */
    console.log(
      JSON.stringify({
        job: JOB.preSmCriar,
        tripId: dados.tripId,
        naoChamou: desfecho.tipo,
        durationMs: Date.now() - inicio,
      }),
    );
    return;
  }

  const cred = credenciaisDaIntegra()!;
  await contarTentativa(tentativa.id);

  try {
    const { codigo } = await setPreSMdeModelo(cred, desfecho.corpo);
    await encerrarTentativaDePreSm({
      id: tentativa.id,
      status: "criada",
      codigo: codigo != null ? String(codigo) : null,
    });
    console.log(
      JSON.stringify({
        job: JOB.preSmCriar,
        tripId: dados.tripId,
        criada: codigo,
        durationMs: Date.now() - inicio,
      }),
    );
  } catch (e) {
    if (e instanceof IntegraRecusou) {
      // Recusa DELA: a mensagem vai inteira para a tela, sem tradução nossa (FR-014). Não adianta
      // tentar de novo — o que ela recusou por regra vai recusar igual daqui a cinco minutos.
      await encerrarTentativaDePreSm({
        id: tentativa.id,
        status: "recusada",
        motivo: `${e.codErro}: ${e.msgErro}`,
      });
      console.warn(
        JSON.stringify({ job: JOB.preSmCriar, tripId: dados.tripId, recusada: e.codErro }),
      );
      return;
    }
    /**
     * Falha de COMUNICAÇÃO: a linha fica `pendente` e o erro sobe, para a fila tentar de novo.
     *
     * `pendente` e não `recusada` porque a diferença é o que a tela diz: "ainda tentando" contra
     * "desistiu" (FR-015). E a linha viva impede que uma nova tentativa nasça em paralelo — o
     * índice único faz esse trabalho.
     *
     * O risco conhecido: a gerenciadora pode ter CRIADO a Pré-SM e a resposta ter se perdido no
     * caminho. Aí a tentativa seguinte cria a segunda, e a primeira fica órfã — paga e invisível.
     * A API não oferece chave de idempotência (ver o contrato), então isso não tem solução daqui;
     * o que existe é o teto diário limitando o estrago enquanto ninguém confia no comportamento.
     */
    if (e instanceof IntegraIndisponivel) {
      console.warn(
        JSON.stringify({ job: JOB.preSmCriar, tripId: dados.tripId, indisponivel: e.detalhe }),
      );
    }
    throw e;
  }
}

export async function registerPreSmCriar(boss: PgBoss): Promise<void> {
  await work(boss, JOB.preSmCriar, runPreSmCriar);
}
