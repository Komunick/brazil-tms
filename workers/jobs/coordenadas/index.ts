import { type PgBoss } from "pg-boss";
import {
  chaveDaCidadeDelas,
  chaveDaEstacao,
  pontasDoKML,
  type PontasDaRota,
} from "@brazil-tms/shared";
import { estacoesSemCoordenada, gravarCoordenadaDaEstacao } from "@brazil-tms/db";
import { JOB, work } from "../../lib/queue";
import {
  IntegraRecusou,
  credenciaisDaIntegra,
  getRotaComKML,
  getRotas,
  type RotaDaGerenciadora,
} from "../../lib/integra/cliente";

/**
 * DE ONDE FICA CADA ESTAÇÃO — a varredura lenta (2026-08-26, a pedido).
 *
 * ── O QUE ELA RESOLVE ─────────────────────────────────────────────────────────────────────────
 *
 * As 459 estações têm as colunas de latitude e longitude e todas VAZIAS. Sem a coordenada da
 * origem, o painel de veículos por perto só consegue dizer "está na mesma cidade da coleta"; com
 * ela, diz "a 12 km, a 25 km, a 39 km" — em ordem, como a tela da gerenciadora faz.
 *
 * ── COMO ELA DESCOBRE ─────────────────────────────────────────────────────────────────────────
 *
 * O `getRotas` com KML devolve a geometria da rota, e as duas pontas caem sobre instalações
 * logísticas reais. A estação é casada com a rota pela CIDADE — `SOC_BA_Simões Filho` e
 * `SIMOES FILHO/BA/BRASIL` viram a mesma chave `BA SIMOES FILHO`.
 *
 * Precisão de cidade, e basta: os caminhões estão a 25, 39 e 122 km, e um erro de oito quilômetros
 * na origem não reordena isso. O porquê inteiro está em `coordenada-de-rota.ts`.
 *
 * ── POR QUE ELA É LENTA DE PROPÓSITO ──────────────────────────────────────────────────────────
 *
 * A gerenciadora recusa chamadas com menos de dez segundos de intervalo. Este job dorme onze entre
 * cada uma — e como cada resposta traz 340 KB para extrair dois pontos, ir rápido não seria só
 * indelicado: seria recusado.
 *
 * Roda de hora em hora e faz POUCAS estações por vez. Não há pressa: coordenada de pátio não muda,
 * e as cinco estações mais movimentadas (1.384 das viagens de 30 dias) são resolvidas no primeiro
 * ciclo, porque a fila vem ordenada por volume.
 */

/** Quantas estações por ciclo. Cinco × 11s = menos de um minuto de job, e cobre o grosso no 1º. */
const POR_CICLO = 5;

const DORMIR_MS = 11_000;

export interface ResultadoDaVarredura {
  ligado: boolean;
  limitada?: boolean;
  candidatas: number;
  resolvidas: number;
  /** Sem rota que tocasse a cidade da estação — o cadastro da gerenciadora não a alcança. */
  semRota: number;
  /** A rota veio, o KML não trouxe ponta utilizável. */
  semPonta: number;
}

export async function runCarregarCoordenadas(): Promise<ResultadoDaVarredura> {
  const cred = credenciaisDaIntegra();
  if (!cred) return { ligado: false, candidatas: 0, resolvidas: 0, semRota: 0, semPonta: 0 };

  const faltando = await estacoesSemCoordenada(POR_CICLO);
  if (faltando.length === 0) {
    return { ligado: true, candidatas: 0, resolvidas: 0, semRota: 0, semPonta: 0 };
  }

  /**
   * O CATÁLOGO DE ROTAS VEM UMA VEZ, sem KML.
   *
   * São 523 rotas com cidade e IBGE nas duas pontas, numa chamada barata. Buscar rota por estação
   * seria uma chamada a mais por estação — o dobro do tempo, para um dado que é o mesmo.
   */
  let rotas: RotaDaGerenciadora[];
  try {
    rotas = await getRotas(cred);
  } catch (e) {
    if (limiteDeConsulta(e)) {
      return { ligado: true, limitada: true, candidatas: 0, resolvidas: 0, semRota: 0, semPonta: 0 };
    }
    throw e;
  }

  const r = { ligado: true, candidatas: faltando.length, resolvidas: 0, semRota: 0, semPonta: 0 };

  for (const [i, estacao] of faltando.entries()) {
    const chave = chaveDaEstacao(estacao.nome);
    if (!chave) {
      // Sem UF no nome não há como saber a cidade. Não é falha da gerenciadora — é o nome da
      // estação que não segue o padrão, e a correção é no cadastro.
      r.semRota++;
      continue;
    }

    const achada = rotaQueToca(rotas, chave);
    if (!achada) {
      r.semRota++;
      continue;
    }

    // A pausa vem ANTES da chamada e é pulada na primeira: dormir onze segundos para depois
    // descobrir que não há nada a fazer é onze segundos jogados fora a cada ciclo.
    if (i > 0) await dormir(DORMIR_MS);

    let pontas: PontasDaRota;
    try {
      const rota = await getRotaComKML(
        cred,
        achada.rota.Codigo,
        achada.rota.CodIBGECidadeOrigem,
        achada.rota.CodIBGECidadeDestino,
      );
      pontas = pontasDoKML(rota?.KML);
    } catch (e) {
      if (limiteDeConsulta(e)) {
        // Para o ciclo inteiro: se a gerenciadora está pedindo espaço, insistir nas próximas quatro
        // só produziria mais recusas. O próximo ciclo pega a fila de onde parou.
        return { ...r, limitada: true };
      }
      throw e;
    }

    const ponto = achada.ponta === "origem" ? pontas.origem : pontas.destino;
    if (!ponto) {
      r.semPonta++;
      continue;
    }

    if (await gravarCoordenadaDaEstacao(estacao.id, ponto.lat, ponto.lon)) r.resolvidas++;
  }

  return r;
}

/**
 * A primeira rota que TOCA a cidade da estação, e por qual ponta.
 *
 * ── QUALQUER ROTA SERVE, E ISSO É DELIBERADO ──────────────────────────────────────────────────
 *
 * Há 50 rotas terminando só em Simões Filho, cada uma num pátio diferente, e nenhuma delas diz qual
 * é o nosso — das 523 rotas cadastradas, só 8 nomeiam a estação. Procurar "a certa" seria procurar
 * uma informação que não existe.
 *
 * O que se quer é *um ponto bom na cidade*, e todas as 50 caem na mesma região logística. Exigir o
 * pátio exato seria pedir uma precisão que a tarefa não usa, e custaria trabalho manual.
 */
function rotaQueToca(
  rotas: readonly RotaDaGerenciadora[],
  chave: string,
): { rota: RotaDaGerenciadora; ponta: "origem" | "destino" } | null {
  for (const rota of rotas) {
    if (chaveDaCidadeDelas(rota.CidadeOrigem) === chave) return { rota, ponta: "origem" };
    if (chaveDaCidadeDelas(rota.CidadeDestino) === chave) return { rota, ponta: "destino" };
  }
  return null;
}

function limiteDeConsulta(e: unknown): boolean {
  return e instanceof IntegraRecusou && /CONSUMO INDEVIDO/i.test(e.message);
}

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function registerCarregarCoordenadas(boss: PgBoss): Promise<void> {
  await work(boss, JOB.coordenadasCarregar, async () => {
    const inicio = Date.now();
    const r = await runCarregarCoordenadas();
    console.log(
      JSON.stringify({ job: JOB.coordenadasCarregar, ...r, durationMs: Date.now() - inicio }),
    );
  });
  /**
   * De hora em hora, e sobrescrevível.
   *
   * Coordenada de pátio não muda: o que importa é a fila drenar, não drenar rápido. Uma hora dá
   * tempo de sobra e mantém o job fora do caminho das consultas que a operação usa de verdade.
   */
  const cron = process.env.COORDENADAS_CRON ?? "17 * * * *";
  await boss.schedule(JOB.coordenadasCarregar, cron, {}, {});
}
