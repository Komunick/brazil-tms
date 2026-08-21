/**
 * OS OITO FARÓIS DO RASTREADOR (2026-08-21).
 *
 * A tela "Veículos Logísticos" do eTorre mostra oito ícones por caminhão, e a sala olha para eles
 * antes de olhar para qualquer número. Eles já vinham na resposta que o robô lê — três estavam
 * sendo gravados, cinco eram jogados fora a cada ciclo.
 *
 * ── COMO O MAPEAMENTO FOI FEITO ────────────────────────────────────────────────────────────────
 *
 * Não por adivinhação de nome: cruzando, veículo a veículo, a COR do ícone na tela do fornecedor
 * com o valor do campo na resposta, em vinte caminhões de uma vez. Sete fecharam vinte de vinte.
 * O oitavo — o alfinete de posição — não tinha campo próprio: `GRJ_FAROLSEMPOSICAO` vem `"S"` para
 * a frota inteira (é a configuração do alerta, não o estado dele). O ícone acende quando a última
 * posição passou do limite que o próprio rastreador informa em `CMM_TEMPOALERTASEMPOSICAO` — 60
 * minutos na conta da empresa. O único vermelho do lote tinha posição de 73 minutos antes; todos os
 * verdes, abaixo de 60.
 *
 * Por isso `semPosicao` é DERIVADO aqui e os outros sete são lidos. Derivar o que se pode ler seria
 * inventar uma segunda régua; ler o que não existe seria pior — era o que fazia o TMS gravar `"S"`
 * para todo mundo e não ter como usar.
 *
 * ── O VOCABULÁRIO DE CADA UM É DIFERENTE, E ISSO É DELES ───────────────────────────────────────
 *
 * `S`/`N`, `MAI`/`MEN`, `MAI`/`MOV`, texto livre. Não normalizamos na gravação: o banco guarda o que
 * o fornecedor escreveu, e a tradução mora aqui, num lugar só. Se ele mudar um código, muda uma
 * linha desta função — e não uma migração de dados.
 */

/** Os oito, na MESMA ORDEM da tela do fornecedor. Quem conhece uma reconhece a outra. */
export const FLEET_ALERT_KEYS = [
  "foraDeRota",
  "paradoDemais",
  "jornadaExcedida",
  "semPosicao",
  "inicioAtrasado",
  "bloqueio",
  "sirene",
  "liberacao",
] as const;

export type FleetAlertKey = (typeof FLEET_ALERT_KEYS)[number];

/** O que o robô gravou, cru, mais o que se precisa para derivar o alfinete de posição. */
export interface FleetAlertSource {
  offRoute: string | null;
  stoppedFlag: string | null;
  drivingTimeFlag: string | null;
  lateStartFlag: string | null;
  blockedFlag: string | null;
  sirenFlag: string | null;
  releaseLabel: string | null;
  /** Instante da última posição, ISO em UTC. */
  positionAt: string | null;
  /** O limite de silêncio que o rastreador informa, em minutos. Ausente cai no padrão. */
  noPositionLimitMinutes: number | null;
}

/**
 * O limite de silêncio quando o rastreador não informa o dele.
 *
 * Sessenta minutos é o valor que a conta da empresa usa hoje, e é o mesmo que a Torre de Controle
 * já aplica para "sem comunicar". Está aqui com nome para as duas telas não divergirem em silêncio.
 */
export const LIMITE_SEM_POSICAO_MIN = 60;

const ligado = (v: string | null, aceso: string): boolean =>
  (v ?? "").trim().toUpperCase() === aceso;

/**
 * Quais dos oito estão ACESOS (vermelhos) agora.
 *
 * `agora` entra por parâmetro porque o único alerta derivado depende do relógio, e um cálculo que lê
 * a hora por conta própria é um cálculo que nenhum teste consegue afirmar.
 */
export function fleetAlerts(v: FleetAlertSource, agora: number = Date.now()): Set<FleetAlertKey> {
  const acesos = new Set<FleetAlertKey>();

  if (ligado(v.offRoute, "S")) acesos.add("foraDeRota");
  // `MAI` de "maior que o permitido"; o verde vem como `MOV`, de movimentando.
  if (ligado(v.stoppedFlag, "MAI")) acesos.add("paradoDemais");
  // Aqui o verde é `MEN`, de "menor que as quatro horas".
  if (ligado(v.drivingTimeFlag, "MAI")) acesos.add("jornadaExcedida");
  if (ligado(v.lateStartFlag, "S")) acesos.add("inicioAtrasado");
  if (ligado(v.blockedFlag, "S")) acesos.add("bloqueio");
  if (ligado(v.sirenFlag, "S")) acesos.add("sirene");
  // Liberação é TEXTO: existir já é o alerta — é uma exceção autorizada, e a sala quer saber quais.
  if ((v.releaseLabel ?? "").trim() !== "") acesos.add("liberacao");

  const limite = (v.noPositionLimitMinutes ?? LIMITE_SEM_POSICAO_MIN) * 60_000;
  // Sem instante nenhum TAMBÉM acende: "nunca comunicou" é o caso mais grave de "está mudo", e
  // tratá-lo como ausência de dado o esconderia justamente de quem precisa ver.
  const posicao = v.positionAt ? new Date(v.positionAt).getTime() : null;
  if (posicao === null || Number.isNaN(posicao) || agora - posicao > limite) {
    acesos.add("semPosicao");
  }

  return acesos;
}
