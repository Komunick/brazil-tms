import "server-only";
import { BSC_PERIODS, saveBscSnapshot, type BscPeriod } from "@brazil-tms/db";
import { Conflict } from "@/lib/api/respond";

/**
 * A porta do BSC (2026-08-17).
 *
 * Um script lê a tela do relatório da Shopee e entrega aqui. Diferente do robô do portal, que
 * encaminha JSON de uma API, este manda TEXTO RASPADO DE TELA — e é por isso que toda a desconfiança
 * mora neste arquivo.
 *
 * Três recusas, e cada uma existe porque o contrário grava mentira:
 *
 *   SEM PERÍODO CONFIRMADO, NÃO ENTRA. Os mesmos indicadores dão números completamente diferentes
 *   conforme o filtro do relatório — a nota geral foi de 72,8 para 62,75 só ao trocar o recorte. Um
 *   número sem período não é um número, é um boato.
 *
 *   SEM CARIMBO, NÃO ENTRA. O BSC fecha às 4h; sem o "Atualizado em" dele, a tela não teria como
 *   dizer de quando é o dado, e um número velho com cara de novo é pior que número nenhum.
 *
 *   NÚMERO FORA DA ESCALA NÃO ENTRA. Se o seletor da Shopee mudar e o script raspar o rótulo errado,
 *   o valor chega absurdo. Melhor recusar a página inteira e aparecer como "sem atualizar" no painel
 *   do que gravar 4.103% de telemetria.
 */

export interface BscFeedResult {
  period: BscPeriod;
  /** Falso quando o mesmo (período, carimbo) já estava aqui — o robô relê todo dia sem mudar nada. */
  isNew: boolean;
  indicators: number;
}

function isPeriod(value: unknown): value is BscPeriod {
  return typeof value === "string" && (BSC_PERIODS as readonly string[]).includes(value);
}

/**
 * "72,8" / "46,03%" / "1.877" → número. Devolve null para o que o BSC mostra em branco ("-", "—",
 * vazio): indicador não publicado é ausência, não zero — e zero puxaria a média para baixo como se
 * fosse desempenho ruim.
 */
export function parseBscNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const texto = raw.trim();
  if (texto === "" || texto === "-" || texto === "—") return null;
  const limpo = texto.replace(/%/g, "").replace(/\s/g, "");
  // Em pt-BR o ponto separa MILHAR, e milhar tem sempre três casas. Um ponto seguido de outra
  // quantidade ("100.00%") não é pt-BR: é o mesmo relatório renderizado em inglês, onde o ponto é
  // DECIMAL — e lê-lo pela regra brasileira devolveria 10.000 no lugar de 100. Como o texto sozinho
  // não diz em que idioma foi escrito, a única saída honesta é recusar; o robô já se recusa a ler a
  // tela fora do português, e isto é a mesma trava do lado de cá.
  if (/\.(?!\d{3}(\D|$))/.test(limpo)) return null;
  const n = Number.parseFloat(limpo.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * A escala do BSC: percentuais e a nota do velocímetro (0–110). Um valor fora disso é raspagem
 * errada, não desempenho — o Scheduling passa de 100 legitimamente (103,98% já foi visto), então o
 * teto é generoso, mas não infinito.
 */
const LIMITE = 1000;

export async function ingestBscSnapshot(input: {
  period?: unknown;
  periodLabel?: unknown;
  capturedAt?: unknown;
  score?: unknown;
  zone?: unknown;
  indicators?: unknown;
}): Promise<BscFeedResult> {
  if (!isPeriod(input.period)) {
    throw new Conflict(
      "BSC_PERIOD_REQUIRED",
      `Informe o recorte: ${BSC_PERIODS.join(", ")}. Um número sem período não significa nada.`,
    );
  }

  const periodLabel = typeof input.periodLabel === "string" ? input.periodLabel.trim() : "";
  if (periodLabel === "") {
    throw new Conflict(
      "BSC_PERIOD_LABEL_REQUIRED",
      "Sem o rótulo do filtro não há prova de qual recorte gerou estes números.",
    );
  }

  const capturedAt = typeof input.capturedAt === "string" ? new Date(input.capturedAt) : null;
  if (!capturedAt || Number.isNaN(capturedAt.getTime())) {
    throw new Conflict(
      "BSC_CAPTURED_AT_REQUIRED",
      "Sem o 'Atualizado em' do relatório, a tela não tem como dizer de quando é o dado.",
    );
  }
  /**
   * Carimbo do futuro é sempre erro de fuso, e é o erro mais silencioso que existe aqui.
   *
   * O painel escolhe, por período, a leitura de maior `captured_at`. Uma leitura adiantada em três
   * horas — foi o que um robô rodando em UTC produziu ao somar -03:00 a uma hora que já era UTC —
   * ganha de todas as leituras corretas pelas três horas seguintes. Não aparece como defeito:
   * aparece como o dado mais fresco que existe. Os dez minutos de folga cobrem relógio destoando.
   */
  if (capturedAt.getTime() > Date.now() + 10 * 60 * 1000) {
    throw new Conflict(
      "BSC_CAPTURED_AT_IN_FUTURE",
      `O carimbo veio ${capturedAt.toISOString()}, no futuro — isso é fuso errado na leitura, ` +
        `e uma leitura adiantada venceria as corretas no painel.`,
    );
  }

  const brutos = (input.indicators ?? {}) as Record<string, unknown>;
  const indicators: Record<string, number> = {};
  for (const [rotulo, valor] of Object.entries(brutos)) {
    const n = parseBscNumber(valor);
    if (n == null) continue;
    if (n < 0 || n > LIMITE) {
      throw new Conflict(
        "BSC_VALUE_OUT_OF_RANGE",
        `"${rotulo}" veio ${n}, fora da escala do BSC — isso é raspagem errada, não desempenho.`,
      );
    }
    indicators[rotulo.trim()] = n;
  }

  const score = parseBscNumber(input.score);
  if (score != null && (score < 0 || score > LIMITE)) {
    throw new Conflict("BSC_VALUE_OUT_OF_RANGE", `A nota veio ${score}, fora da escala.`);
  }

  const { isNew } = await saveBscSnapshot({
    period: input.period,
    periodLabel,
    capturedAt: capturedAt.toISOString(),
    score,
    zone: typeof input.zone === "string" && input.zone.trim() !== "" ? input.zone.trim() : null,
    indicators,
  });

  return { period: input.period, isNew, indicators: Object.keys(indicators).length };
}
