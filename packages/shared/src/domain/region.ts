import { DateTime } from "luxon";
import { APP_TIME_ZONE } from "../formatting";

/**
 * As REGIÕES OPERACIONAIS do cliente (2026-08-20).
 *
 * Três frentes, e o vocabulário é o da operação, não o do IBGE:
 *
 *   NONE     Norte + Nordeste
 *   SUDESTE  Sudeste
 *   SULCO    Sul + Centro-Oeste
 *
 * `NONE` parece "nenhuma" e não é — foi a primeira leitura errada que este código quase gravou. Fica
 * escrito aqui porque o nome vai continuar sugerindo isso a quem chegar depois.
 *
 * ── POR QUE UMA LISTA, E NÃO UM TIPO FECHADO ───────────────────────────────────────────────────
 *
 * A lista existe para ORDENAR os cartões do painel, não para validar. A região vem de uma planilha
 * que o cliente mantém, e uma quarta frente pode aparecer sem passar por aqui: um tipo fechado
 * transformaria isso em erro de compilação num lugar que não tem culpa, e — pior — o valor novo
 * sumiria da tela em vez de aparecer fora de ordem. `regionPosition` põe o desconhecido no fim.
 */
export const REGION_ORDER = ["NONE", "SUDESTE", "SULCO"] as const;

export type KnownRegion = (typeof REGION_ORDER)[number];

/**
 * A posição do cartão da região no painel.
 *
 * Ordem declarada, nunca alfabética: num painel de parede a posição é como as pessoas encontram o
 * cartão, e ela não pode mudar porque uma região nova começa com "A". Desconhecida vai para o fim;
 * `null` (estação sem região) vai depois de tudo — é pendência de cadastro, não uma frente.
 */
export function regionPosition(region: string | null): number {
  if (region === null) return REGION_ORDER.length + 1;
  const i = (REGION_ORDER as readonly string[]).indexOf(region);
  return i === -1 ? REGION_ORDER.length : i;
}

/**
 * O PRAZO DE ATRIBUIÇÃO já venceu para uma viagem que coleta HOJE? (2026-08-20, a pedido)
 *
 * A regra da operação: a viagem pode ser atribuída até o MEIO-DIA do próprio dia da coleta. Depois
 * disso, sem motorista, ela é uma LH atrasada — e o painel a mostra piscando, porque quem passa em
 * frente à TV precisa ver isso sem procurar.
 *
 * Vale só para o dia de HOJE. Amanhã e depois de amanhã têm o prazo inteiro pela frente, e pintar de
 * vermelho o que ainda tem um dia de folga ensina a operação a ignorar vermelho.
 *
 * O meio-dia é o de SÃO PAULO, não o do relógio de quem abriu a tela: o painel roda numa TV na
 * operação, mas também é aberto de casa, e a hora do fuso de casa não decide prazo de ninguém.
 */
export function prazoDeAtribuicaoVencido(agora: DateTime = DateTime.now()): boolean {
  return agora.setZone(APP_TIME_ZONE).hour >= 12;
}
