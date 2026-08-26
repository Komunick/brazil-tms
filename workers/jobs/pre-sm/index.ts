import { type PgBoss } from "pg-boss";
import type { OwnershipType, PreSmCriarPayload } from "@brazil-tms/shared";
import {
  abrirTentativaDePreSm,
  contarTentativa,
  criadasHoje,
  encerrarTentativaDePreSm,
  linhaDaFilaGR,
} from "@brazil-tms/db";
import { JOB, work } from "../../lib/queue";
import {
  credenciaisDaIntegra,
  IntegraIndisponivel,
  IntegraRecusou,
  setPreSM,
} from "../../lib/integra/cliente";
import { decidir } from "./criar";

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
  /**
   * A MESMA fonte que a fila da aba GR usa (2026-08-26, fatia 027).
   *
   * Se o job lesse o mundo por um caminho e a tela por outro, a linha ficaria verde e o envio
   * recusaria — ou o contrário, que é pior: a pessoa apertaria achando que resolveu. Uma fonte só é
   * o que garante que os dois concordem sempre.
   */
  const linha = await linhaDaFilaGR(payload.tripId);

  if (!linha) {
    // A viagem saiu da fila entre o pedido e o trabalho: encerrada, cancelada, ou a atribuição
    // desfeita. Não há o que criar, e não é falha.
    console.log(JSON.stringify({ job: JOB.preSmCriar, foraDaFila: payload.tripId }));
    return;
  }

  const desfecho = decidir(
    {
      codFilial: Number(process.env.INTEGRA_COD_FILIAL ?? 0) || null,
      codPerfilSeguranca: Number(process.env.INTEGRA_COD_PERFIL_SEGURANCA ?? 0) || null,
      codRota: linha.codRota,
      codIbgeOrigem: linha.codIbgeOrigem,
      codIbgeDestino: linha.codIbgeDestino,
      cpfMotorista: linha.cpfMotorista,
      vinculoMotorista: linha.vinculoMotorista as OwnershipType | null,
      cpfSegundoMotorista: linha.cpfSegundoMotorista,
      vinculoSegundoMotorista: linha.vinculoSegundoMotorista as OwnershipType | null,
      placas: linha.placas.map((p) => ({
        placa: p.placa,
        vinculo: p.vinculo as OwnershipType | null,
      })),
      chegadaNaColeta: linha.chegadaNaColeta,
      saidaDaColeta: linha.saidaDaColeta,
      chegadaNaEntrega: linha.chegadaNaEntrega,
      saidaDaEntrega: linha.saidaDaEntrega,
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
    tripId: linha.tripId,
    codModelo: linha.codRota,
    payloadEnviado: desfecho.tipo === "nao_criar" ? null : desfecho.corpo,
  });

  if (!tentativa) {
    // O índice único recusou: já existe uma viva. O reprocesso encontrou o trabalho feito.
    console.log(JSON.stringify({ job: JOB.preSmCriar, tripId: linha.tripId, jaExistia: true }));
    return;
  }

  if (desfecho.tipo === "nao_criar") {
    await encerrarTentativaDePreSm({
      id: tentativa.id,
      status: "sem_dados",
      motivo: desfecho.motivos.join(", ") || "sem_configuracao",
    });
    console.log(
      JSON.stringify({
        job: JOB.preSmCriar,
        tripId: linha.tripId,
        naoCriou: desfecho.motivos,
        durationMs: Date.now() - inicio,
      }),
    );
    return;
  }

  if (desfecho.tipo === "desligado" || desfecho.tipo === "teto_atingido") {
    /**
     * ENCERRA como `nao_tentada` — e o encerramento é o conserto, não um detalhe.
     *
     * Antes esta linha ficava `pendente`, e `pendente` conta como VIVA no índice único parcial.
     * Duas coisas quebravam por causa disso:
     *
     *   Nada volta para buscar linha `pendente`. Ligar o interruptor não as converte — não existe
     *   quem as drene —, então "esperando autorização" era uma promessa que ninguém ia cumprir.
     *
     *   E elas BLOQUEAVAM a viagem: a atribuição seguinte colidia no índice e o trabalho registrava
     *   "já existia", sem criar nada. O efeito apareceria no primeiro teste real — escolher uma
     *   viagem já atribuída durante o dia de observação faria o sistema não fazer NADA, e pareceria
     *   integração quebrada.
     *
     * Drenar as pendentes ao ligar seria pior: dispararia de uma vez tudo o que se acumulou no
     * período desligado, cobrado, sem ninguém olhando.
     *
     * O que se preserva: `payload_enviado` continua guardando o que TERIA sido mandado — é o valor
     * inteiro do dia de observação, e é o que responde "quantas nasceriam se eu ligasse".
     */
    await encerrarTentativaDePreSm({
      id: tentativa.id,
      status: "nao_tentada",
      motivo: desfecho.tipo,
    });
    console.log(
      JSON.stringify({
        job: JOB.preSmCriar,
        tripId: linha.tripId,
        naoChamou: desfecho.tipo,
        durationMs: Date.now() - inicio,
      }),
    );
    return;
  }

  const cred = credenciaisDaIntegra()!;
  await contarTentativa(tentativa.id);

  try {
    const { codigo } = await setPreSM(cred, desfecho.corpo);
    await encerrarTentativaDePreSm({
      id: tentativa.id,
      status: "criada",
      codigo: codigo != null ? String(codigo) : null,
    });
    console.log(
      JSON.stringify({
        job: JOB.preSmCriar,
        tripId: linha.tripId,
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
        JSON.stringify({ job: JOB.preSmCriar, tripId: linha.tripId, recusada: e.codErro }),
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
        JSON.stringify({ job: JOB.preSmCriar, tripId: linha.tripId, indisponivel: e.detalhe }),
      );
    }
    throw e;
  }
}

export async function registerPreSmCriar(boss: PgBoss): Promise<void> {
  await work(boss, JOB.preSmCriar, runPreSmCriar);
}
