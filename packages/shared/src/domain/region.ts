/**
 * As REGIÕES OPERACIONAIS do cliente (2026-08-20).
 *
 * Três frentes, e o vocabulário é o da operação, não o do IBGE:
 *
 *   NONE     Norte + Nordeste
 *   SULCO    Sul + Centro-Oeste
 *   SUDESTE  Sudeste
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
 *
 * A ORDEM É A DA OPERAÇÃO, e mudou uma vez (2026-08-23, a pedido): NONE, SULCO, SUDESTE. Não é
 * alfabética nem geográfica, e não precisa ser — é a ordem em que quem olha o painel procura. Por
 * isso ela mora num lugar só: o servidor ordena os recortes e a tela reordena as linhas, e as duas
 * leem esta lista.
 */
export const REGION_ORDER = ["NONE", "SULCO", "SUDESTE"] as const;

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
