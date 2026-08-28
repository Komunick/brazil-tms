import { type PgBoss } from "pg-boss";
import { gravarPosicoesDaGerenciadora, type PosicaoParaGravar } from "@brazil-tms/db";
import { JOB, work } from "../../lib/queue";
import { IntegraRecusou, credenciaisDaIntegra, getPosicoes } from "../../lib/integra/cliente";

/**
 * ONDE ESTÁ CADA CAMINHÃO — a carga das posições da gerenciadora (2026-08-26, a pedido).
 *
 * ── POR QUE ISTO EXISTE, tendo `fleet_positions` ──────────────────────────────────────────────
 *
 * Porque aquela vem do robô que LÊ A GRADE do eTorre, e a posição chega como TEXTO: "0.64 km de
 * FILIAL COOPERCARGA JABOATÃO DOS GUARARAPES". Dá para uma pessoa ler e não dá para calcular nada —
 * não se ordena por distância a partir de uma frase, nem se põe um alfinete no mapa.
 *
 * O `getPosicoes` devolve latitude e longitude. É o que abre a porta para o mapa da frota e, quando
 * as estações tiverem coordenada, para a busca por proximidade da origem.
 *
 * ── NÃO GASTA NADA, E POR ISSO PODE RODAR DE MINUTO EM MINUTO ─────────────────────────────────
 *
 * A gerenciadora cobra por SOLICITAÇÃO de monitoramento, não por consulta. `getPosicoes` é leitura
 * pura: pode rodar à vontade, inclusive com a criação de Pré-SM desligada.
 *
 * O passo é de um minuto porque é o que o dado permite — medido em 26/08, 82 dos 91 veículos tinham
 * posição de menos de uma hora, e as mais recentes eram de segundos atrás. Um passo mais longo
 * jogaria fora frescor que já está disponível de graça.
 *
 * ── SEM CREDENCIAL, NÃO FAZ NADA — e isso é um estado legítimo ────────────────────────────────
 *
 * A mesma regra de toda a integração: sem `INTEGRA_LOGIN`/`INTEGRA_SENHA` o job registra que está
 * desligado e sai. Não é falha, é o padrão — e é o que permite subir isto sem ligar nada.
 */

export interface ResultadoDaCarga {
  ligado: boolean;
  /** A gerenciadora recusou por consulta rápida demais. Não é falha — ver o topo de `runCarregarPosicoes`. */
  limitada?: boolean;
  recebidas: number;
  gravadas: number;
  /** Sem coordenada utilizável: nulas, ou zero-zero. Ver o comentário de `coordenada`. */
  descartadas: number;
}

export async function runCarregarPosicoes(): Promise<ResultadoDaCarga> {
  const cred = credenciaisDaIntegra();
  if (!cred) return { ligado: false, recebidas: 0, gravadas: 0, descartadas: 0 };

  /**
   * A GERENCIADORA LIMITA A FREQUÊNCIA: dez segundos entre consultas.
   *
   * Descoberto do jeito difícil em 26/08. Uma falha de gravação fez o pg-boss reexecutar o job em
   * rajada, as chamadas caíram dentro dos dez segundos, e a API passou a responder
   * "CONSUMO INDEVIDO. 10 segundos". O sintoma que aparecia PRIMEIRO no log não era a causa — o
   * defeito real era uma data mal serializada no INSERT.
   *
   * ── E POR QUE ISSO NÃO PODE VIRAR EXCEÇÃO ─────────────────────────────────────────────────
   *
   * Porque exceção faz o pg-boss tentar de novo, e tentar de novo é exatamente o que a gerenciadora
   * está pedindo para não fazer. Seria um laço que se alimenta: recusa, retenta, recusa.
   *
   * O job roda de minuto em minuto. Perder um ciclo não custa nada — o próximo traz a posição de
   * qualquer forma, e ela terá menos de sessenta segundos.
   */
  let cruas;
  try {
    cruas = await getPosicoes(cred);
  } catch (e) {
    if (e instanceof IntegraRecusou && /CONSUMO INDEVIDO/i.test(e.message)) {
      return { ligado: true, limitada: true, recebidas: 0, gravadas: 0, descartadas: 0 };
    }
    throw e;
  }

  const paraGravar: PosicaoParaGravar[] = [];
  let descartadas = 0;
  for (const p of cruas) {
    const placa = normalizarPlaca(p.Placa);
    if (!placa) {
      descartadas++;
      continue;
    }
    const lat = coordenada(p.Latitude);
    const lon = coordenada(p.Longitude);
    if (lat === null || lon === null) {
      // Guardado mesmo assim, sem coordenada: a placa continua existindo na frota monitorada, e a
      // ausência é informação — "a gerenciadora conhece este caminhão e não sabe onde ele está".
      // Quem desenha o mapa filtra; quem conta a frota, não.
      descartadas++;
    }
    paraGravar.push({
      placa,
      latitude: lat,
      longitude: lon,
      cidade: texto(p.Cidade),
      uf: texto(p.UF),
      cpfMotorista: soDigitos(p.Motorista),
      ignicao: texto(p.Ignicao),
      referencia: texto(p.PosReferencia),
      /*
       * OS TRÊS CAMPOS QUE JÁ CHEGAVAM E A GENTE DESCARTAVA (2026-08-28).
       *
       * Medido em produção com 108 posições: velocidade em 37 (nenhuma zero — o campo não vem
       * quando o veículo está parado), tipo de rastreador e distância em 108 de 108.
       *
       * São eles que fazem a cor do ponto no mapa significar alguma coisa: antes ela dizia só
       * qual linha da lista estava selecionada.
       */
      velocidade: inteiro(p.Velocidade),
      tipoRastreador: texto(p.TipoRastreador),
      distUltPosicao: numero(p.DistUltPosicao),
      posicaoEm: data(p.DataHoraPos),
    });
  }

  const gravadas = await gravarPosicoesDaGerenciadora(paraGravar);
  return { ligado: true, recebidas: cruas.length, gravadas, descartadas };
}

/**
 * ZERO NÃO É COORDENADA — é o que a gerenciadora manda quando não sabe.
 *
 * Latitude e longitude zero são um ponto REAL, no Atlântico ao largo da África. Dois dos 91
 * registros medidos em 26/08 vieram assim, junto com data ausente. Passar adiante poria dois
 * caminhões no meio do oceano, e o mapa perderia a confiança de quem olha.
 */
/**
 * Um número qualquer, e NÃO uma coordenada.
 *
 * `coordenada` recusa zero e corta fora de ±180, porque para latitude e longitude essas duas
 * coisas são erro de origem. Para distância percorrida as duas são legítimas: zero é "não saiu do
 * lugar" — que é justamente o que a tela quer saber — e 300 km é uma viagem.
 *
 * Reusar `coordenada` aqui apagaria em silêncio exatamente o caso mais informativo.
 */
function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Velocidade em km/h. Ausente quando o veículo não está andando — ver o schema. */
function inteiro(v: unknown): number | null {
  const n = numero(v);
  return n === null ? null : Math.round(n);
}

function coordenada(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  // Fora do planeta é erro de origem, não posição.
  if (n < -180 || n > 180) return null;
  return n;
}

/** O campo chamado `Motorista` traz CPF. Só os dígitos, para casar com o nosso cadastro. */
function soDigitos(v: unknown): string | null {
  const s = String(v ?? "").replace(/\D/g, "");
  return s === "" ? null : s;
}

function normalizarPlaca(v: unknown): string {
  return String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function texto(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

/** A data da tecnologia. Ausente ou impossível vira `null` — melhor sem data que com data falsa. */
function data(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function registerCarregarPosicoes(boss: PgBoss): Promise<void> {
  await work(boss, JOB.posicoesCarregar, async () => {
    const inicio = Date.now();
    const r = await runCarregarPosicoes();
    console.log(
      JSON.stringify({
        job: JOB.posicoesCarregar,
        ...r,
        durationMs: Date.now() - inicio,
      }),
    );
  });
  /**
   * De minuto em minuto — e o cron é sobrescrevível.
   *
   * O padrão acompanha o frescor que o dado já tem. `POSICOES_CRON` existe para afrouxar sem
   * deploy, se um dia a gerenciadora reclamar do volume de consultas.
   */
  const cron = process.env.POSICOES_CRON ?? "* * * * *";
  await boss.schedule(JOB.posicoesCarregar, cron, {}, {});
}
