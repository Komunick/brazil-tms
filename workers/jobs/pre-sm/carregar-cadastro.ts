import { type PgBoss } from "pg-boss";
import type { PreSmCarregarCadastroPayload } from "@brazil-tms/shared";
import { acharCidade, chaveDaEstacao, proporRotas } from "@brazil-tms/shared";
import {
  gravarPropostasDeCidade,
  gravarPropostasDeRota,
  rotasParaCorrespondencia,
} from "@brazil-tms/db";
import { JOB, work } from "../../lib/queue";
import { credenciaisDaIntegra, getCidades, getRotas } from "../../lib/integra/cliente";

/**
 * CARREGAR O CADASTRO DA GERENCIADORA — cidades e rotas (2026-08-26, fatia 027).
 *
 * É a peça que enche as duas telas de conferência. Sem ela, elas abrem vazias e a fila da aba GR
 * diria "sem rota" em toda linha.
 *
 * ── UMA CARGA SÓ, E A RAZÃO FICOU MAIS FORTE ──────────────────────────────────────────────────
 *
 * As duas correspondências saem da **mesma chamada**: o `getRotas` sem parâmetros devolve as 518
 * rotas com `CodIBGECidadeOrigem` e `CodIBGECidadeDestino`, e é o par de IBGE que casa a rota. Dois
 * jobs separados fariam a mesma consulta duas vezes para partir o resultado ao meio — e criariam uma
 * ordem implícita que ninguém documentou.
 *
 * ── NÃO GASTA NADA ────────────────────────────────────────────────────────────────────────────
 *
 * A gerenciadora cobra por **solicitação**, não por consulta. `getRotas` e `getCidades` são leitura
 * pura: este job pode rodar quantas vezes quiserem, inclusive com a criação desligada, sem custo e
 * sem criar nada lá.
 *
 * É por isso que ele **não** olha `INTEGRA_PRE_SM_ATIVO`: esse interruptor governa a criação de
 * Pré-SM, e amarrar a carga a ele impediria justamente o preparo que precisa acontecer antes.
 *
 * ── PROPÕE, NUNCA CONFIRMA ────────────────────────────────────────────────────────────────────
 *
 * Toda linha nasce com `confirmado_em` nulo. O casamento, quando erra, erra apontando para OUTRA
 * cidade ou OUTRA rota — não em branco. Uma carga que confirmasse sozinha transformaria um erro de
 * normalização em escolta contratada para o trajeto errado.
 */
export async function runPreSmCarregarCadastro(
  payload: PreSmCarregarCadastroPayload,
): Promise<void> {
  const inicio = Date.now();

  const cred = credenciaisDaIntegra();
  if (!cred) {
    /**
     * Sem credencial não há o que consultar, e o certo é dizer alto.
     *
     * Falhar em silêncio deixaria as telas vazias com a pessoa achando que o casamento não encontrou
     * nada — uma conclusão errada sobre o cadastro dela, não sobre a nossa configuração.
     */
    console.error(JSON.stringify({ job: JOB.preSmCarregarCadastro, semCredencial: true }));
    throw new Error("sem credencial da Integra para carregar o cadastro");
  }

  const [cidadesDelas, rotasDelas] = await Promise.all([getCidades(cred), getRotas(cred)]);
  const nossas = await rotasParaCorrespondencia(payload.diasParaTras);

  // ── A ponte de cidade, primeiro: a de rota depende do IBGE que sai daqui. ──────────────────
  const catalogo = cidadesDelas.map((c) => ({ codIbge: c.CodIBGE, cidade: c.Cidade, uf: c.UF }));
  const ibgePorEstacao = new Map<string, number>();
  const cidades = [];
  const semCidade = new Set<string>();

  for (const n of nossas) {
    for (const estacao of [n.origem, n.destino]) {
      const chave = chaveDaEstacao(estacao);
      if (!chave || ibgePorEstacao.has(chave)) continue;
      const p = acharCidade(estacao, catalogo);
      if (p) {
        ibgePorEstacao.set(chave, p.codIbge);
        cidades.push(p);
      } else {
        semCidade.add(estacao);
      }
    }
  }

  const rotas = proporRotas(
    nossas,
    ibgePorEstacao,
    rotasDelas.map((r) => ({
      codigo: r.Codigo,
      descricao: r.Descricao,
      codIbgeOrigem: r.CodIBGECidadeOrigem,
      codIbgeDestino: r.CodIBGECidadeDestino,
    })),
  );

  const [gCidades, gRotas] = await Promise.all([
    gravarPropostasDeCidade(cidades),
    gravarPropostasDeRota(rotas),
  ]);

  /**
   * O log conta o que cada número responde, e são perguntas diferentes.
   *
   * `nossasRotas` menos `rotasCasadas` é o tamanho do trabalho de cadastro que sobra **na
   * gerenciadora**; `semCidade` é o que precisa de atenção **aqui**. Registrar só "gravei N"
   * deixaria ambíguo se um número baixo significa cadastro completo ou casamento que falhou.
   *
   * Medido em 25/08, para comparação: 5.571 cidades, 518 rotas dela, 134 nossas, 79 estações
   * resolvidas, **57 rotas casadas** — 57% das viagens.
   */
  console.log(
    JSON.stringify({
      job: JOB.preSmCarregarCadastro,
      pedidoPor: payload.pedidoPor,
      cidadesDela: cidadesDelas.length,
      rotasDela: rotasDelas.length,
      nossasRotas: nossas.length,
      estacoesResolvidas: ibgePorEstacao.size,
      semCidade: semCidade.size,
      rotasCasadas: rotas.length,
      novasCidades: gCidades.novas,
      novasRotas: gRotas.novas,
      durationMs: Date.now() - inicio,
    }),
  );
}

export async function registerPreSmCarregarCadastro(boss: PgBoss): Promise<void> {
  await work(boss, JOB.preSmCarregarCadastro, runPreSmCarregarCadastro);
}
