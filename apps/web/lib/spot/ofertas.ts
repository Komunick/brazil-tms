import type { SpotOfferView } from "@brazil-tms/db";

/**
 * QUAL oferta a TV anuncia, e quais ela engole (2026-08-18).
 *
 * A regra é a mesma do monitor que manda no Telegram, e pela mesma razão: a primeira resposta que a
 * tela recebe é um RETRATO, não uma novidade. Anunciá-lo faria a TV disparar tudo o que ainda está
 * em leilão sempre que alguém abrisse a página — e essa tela recarrega sozinha quando a rede volta,
 * então o disparo em massa aconteceria de madrugada, sem ninguém por perto para entender.
 *
 * Por isso a primeira leitura só MARCA o que existe. Da segunda em diante, id que nunca foi visto é
 * oferta nova e vira aviso.
 */

export interface EstadoOfertas {
  /** Ids já conhecidos — os anunciados e os que vieram no retrato inicial. */
  vistos: Set<string>;
  /** Falso até a primeira resposta chegar. É o que separa "retrato" de "novidade". */
  iniciado: boolean;
}

export function estadoInicial(): EstadoOfertas {
  return { vistos: new Set(), iniciado: false };
}

/**
 * Recebe a lista da resposta e devolve o que deve ser anunciado, em ordem de chegada (a mais antiga
 * primeiro, para a fila da tela contar a história na ordem em que aconteceu).
 *
 * Muta `estado` de propósito: ele é a memória da sessão da TV, e copiá-lo a cada ciclo só criaria
 * chance de a cópia se perder e a mesma oferta ser anunciada duas vezes.
 */
export function novasOfertas(estado: EstadoOfertas, recebidas: SpotOfferView[]): SpotOfferView[] {
  const novas: SpotOfferView[] = [];
  for (const o of recebidas) {
    if (estado.vistos.has(o.id)) continue;
    estado.vistos.add(o.id);
    if (estado.iniciado) novas.push(o);
  }
  estado.iniciado = true;
  // A resposta vem da mais nova para a mais antiga; a fila da tela mostra na ordem em que chegaram.
  return novas.reverse();
}

/**
 * UMA POR VEZ NA TELA; O RESTO VAI PARA A CAIXA (2026-08-21, a pedido).
 *
 * O aviso ocupa o meio da tela por trinta segundos e a fila passava uma atrás da outra. Nas sextas
 * chegam mais de cinquenta ofertas em sequência — o monitor manda UMA A UMA, então cada busca acha
 * uma nova — e a conta é direta: cinquenta avisos de trinta segundos são vinte e cinco minutos de
 * tela ocupada, com som a cada uma. Numa sala onde a TV serve para olhar de relance, isso deixa de
 * ser aviso e vira ruído que a operação aprende a ignorar.
 *
 * A regra: enquanto um cartão estiver na tela, oferta nova NÃO entra na fila. Ela continua chegando,
 * continua gravada, continua aparecendo na caixa de ofertas do dia — só não interrompe de novo.
 *
 * ── POR QUE NÃO É "AGRUPAR EM UM CARTÃO SÓ" ────────────────────────────────────────────────────
 *
 * Porque elas não chegam juntas. Vindo uma a uma, espaçadas, não existe lote para agrupar: quando a
 * segunda chega, o cartão da primeira já está na tela. A pergunta certa não é "quantas vieram
 * juntas?", é "já tem uma aparecendo?".
 *
 * ── NADA SE PERDE ──────────────────────────────────────────────────────────────────────────────
 *
 * A caixa de ofertas do dia mostra TODAS, com a lista completa e clicável. O que este corte tira é a
 * interrupção, não a informação — e o próprio cartão diz quantas foram absorvidas enquanto ele
 * estava lá, para ninguém precisar desconfiar de que perdeu alguma.
 */
export interface DecisaoDeAviso {
  /** A oferta que vai para a tela, ou `null` quando já há uma aparecendo. */
  anunciar: SpotOfferView | null;
  /** Quantas foram para a caixa sem passar pela tela. */
  absorvidas: number;
}

export function decidirAviso(
  temCartaoNaTela: boolean,
  novas: readonly SpotOfferView[],
): DecisaoDeAviso {
  if (novas.length === 0) return { anunciar: null, absorvidas: 0 };
  // Com um cartão na tela, TODAS vão para a caixa — inclusive quando a mesma busca traz várias.
  if (temCartaoNaTela) return { anunciar: null, absorvidas: novas.length };
  // Sem cartão, a mais antiga sobe (é a que conta a história na ordem) e as outras acumulam.
  return { anunciar: novas[0] ?? null, absorvidas: Math.max(0, novas.length - 1) };
}
