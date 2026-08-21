/**
 * QUANDO UM ROBÔ ESTÁ ATRASADO (2026-08-19).
 *
 * O banco devolve carimbo; esta é a régua. Ela mora aqui, e não na consulta, por dois motivos: é
 * decisão de produto e vai mudar, e assim ela é testável sem banco nenhum.
 *
 * Nasceu de uma falha medida. Em 2026-08-18 o robô do portal ficou SEIS HORAS sem entregar nada — o
 * token do servidor tinha 23 caracteres e a rota exige 32, então ela recusava tudo com 401. Nada na
 * tela denunciava: o navegador da VM seguia aberto na aba certa, o site no ar, o painel desenhando os
 * mesmos números com a mesma cor. O único sinal vivia num console dentro de uma VM, atrás de VNC.
 */

export type Saude = "ok" | "atrasado" | "sem_dado" | "sem_regua";

/**
 * Minutos de silêncio até acusar, por fonte. `null` = fonte SEM cadência esperada.
 *
 * As três réguas são muito diferentes e nenhuma é arbitrária:
 *
 *   portal  20 min — QUATRO ciclos perdidos, e o número segue os ciclos: eram 15 minutos quando esta
 *                    régua nasceu em 60, e passaram a 5 sem que ela acompanhasse. O princípio sempre
 *                    foi "quatro ciclos"; o 60 é que ficou para trás. Vinte minutos mantêm a folga
 *                    para uma sessão que expirou e se renovou, um deploy, um relatório pesado — sem
 *                    que o aviso vire ruído.
 *
 *                    Se o ciclo baixar de novo, esta régua precisa baixar junto. O aviso que NÃO
 *                    depende de calibragem é o de ciclo lento, logo abaixo: ele compara o robô com a
 *                    promessa que o próprio robô declara.
 *
 *   bsc  30 h — o relatório do cliente é publicado uma vez por dia, de madrugada. Dado de 20 horas é
 *               rotina, e é o mesmo número que o cartão do painel já usa. Trinta horas significa que
 *               a publicação da madrugada não chegou, com um dia inteiro de folga antes de acusar.
 *
 *   spot  null — oferta de spot é EVENTO, não batida de relógio. Podem passar dias sem nenhuma e
 *                isso não diz nada sobre o robô. Acusar aqui seria inventar uma falha; a tela mostra
 *                a última recebida como informação, sem cor de alarme.
 */
export const REGUA_MINUTOS: Record<string, number | null> = {
  portal: 20,
  bsc: 30 * 60,
  spot: null,
};

/**
 * A régua das tarefas do worker: 60 minutos para todas.
 *
 * Elas têm cadências diferentes (SLA e documentos a cada 5 min, retiradas a cada 30), e a tentação é
 * uma régua por tarefa. Seria mentira: as três são sobrescrevíveis por variável de ambiente no
 * worker (`SLA_SWEEP_CRON` e companhia), então uma tabela aqui estaria errada no dia em que alguém
 * mudasse o cron — e errada em silêncio, que é o defeito que esta página existe para combater.
 *
 * Uma hora cobre as duas cadências com folga (doze ciclos perdidos na mais rápida, dois na mais
 * lenta) e não depende de saber o que o worker está fazendo.
 */
export const REGUA_TAREFA_MINUTOS = 60;

export interface Frescor {
  /** Minutos desde o último sinal. `Infinity` quando nunca houve um. */
  minutos: number;
  saude: Saude;
}

function idade(ultimo: Date | string | null | undefined, agora: Date): number {
  if (!ultimo) return Number.POSITIVE_INFINITY;
  const carimbo = ultimo instanceof Date ? ultimo : new Date(ultimo);
  if (Number.isNaN(carimbo.getTime())) return Number.POSITIVE_INFINITY;
  // `Math.abs` porque carimbo no FUTURO é sintoma, não frescor. Já aconteceu neste projeto: o robô
  // somava -03:00 a uma hora que já era UTC e todo dado nascia três horas à frente. Sem o valor
  // absoluto a idade fica negativa e jamais cruza o limite — o relógio errado passa despercebido.
  return Math.abs((agora.getTime() - carimbo.getTime()) / 60_000);
}

export function saudeDaFonte(
  chave: string,
  ultimo: Date | string | null | undefined,
  agora: Date,
): Frescor {
  const minutos = idade(ultimo, agora);
  const regua = REGUA_MINUTOS[chave];
  // Fonte sem cadência esperada nunca fica vermelha — mas "nunca recebeu nada" continua sendo dito,
  // porque aí a informação é a ausência.
  if (regua == null) {
    return { minutos, saude: Number.isFinite(minutos) ? "sem_regua" : "sem_dado" };
  }
  if (!Number.isFinite(minutos)) return { minutos, saude: "sem_dado" };
  return { minutos, saude: minutos >= regua ? "atrasado" : "ok" };
}

export function saudeDaTarefa(ultimo: Date | string | null | undefined, agora: Date): Frescor {
  const minutos = idade(ultimo, agora);
  if (!Number.isFinite(minutos)) return { minutos, saude: "sem_dado" };
  return { minutos, saude: minutos >= REGUA_TAREFA_MINUTOS ? "atrasado" : "ok" };
}

/**
 * "há 75 min" até duas horas, depois em horas, depois em dias.
 *
 * Minutos são a unidade em que o problema nasce, mas ninguém lê "há 380 min" e entende "desde o
 * começo da tarde". `null` quando não há carimbo — a tela usa outra frase, porque "sem atualizar há
 * Infinity min" seria pior que não avisar.
 */
export function idadeEmTexto(minutos: number): string | null {
  if (!Number.isFinite(minutos)) return null;
  const m = Math.abs(Math.round(minutos));
  if (m < 120) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} dias`;
}

/**
 * O ROBÔ ESTÁ SUFOCANDO? (2026-08-21)
 *
 * A régua acima pega a PARADA — mas só depois dela. Quando o navegador da VM começa a não dar conta,
 * o sintoma vem antes e é outro: o ciclo configurado para 10 segundos passa a levar 45. O dado
 * continua chegando, só que velho, o carimbo está fresco, a tela diz "ok" — e a operação decide sobre
 * um retrato de um minuto atrás achando que é de agora.
 *
 * A conta é a comparação direta entre o que o robô prometeu e o que ele entregou.
 *
 * A FOLGA DE 50% não é generosidade: um ciclo é rede mais parsing mais gravação, e variar é normal.
 * Acusar no primeiro ciclo que passar de 10,1 segundos criaria um alarme que pisca o dia inteiro — e
 * alarme que pisca sempre é alarme que ninguém olha. Meia vez acima do prometido já é tendência.
 */
export const FOLGA_DO_CICLO = 1.5;

export type SaudeDoCiclo = "ok" | "lento" | "sem_dado";

export function saudeDoCiclo(
  intervalMs: number | null,
  durationMs: number | null,
): { saude: SaudeDoCiclo; razao: number | null } {
  if (intervalMs == null || durationMs == null || intervalMs <= 0) {
    return { saude: "sem_dado", razao: null };
  }
  const razao = durationMs / intervalMs;
  return { saude: razao > FOLGA_DO_CICLO ? "lento" : "ok", razao };
}
