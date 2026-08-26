import { type PgBoss } from "pg-boss";
import { gravarPosicoesDaGerenciadora, type PosicaoParaGravar } from "@brazil-tms/db";
import { JOB, work } from "../../lib/queue";
import { credenciaisDaIntegra, getPosicoes } from "../../lib/integra/cliente";

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
  recebidas: number;
  gravadas: number;
  /** Sem coordenada utilizável: nulas, ou zero-zero. Ver o comentário de `coordenada`. */
  descartadas: number;
}

export async function runCarregarPosicoes(): Promise<ResultadoDaCarga> {
  const cred = credenciaisDaIntegra();
  if (!cred) return { ligado: false, recebidas: 0, gravadas: 0, descartadas: 0 };

  const cruas = await getPosicoes(cred);

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
