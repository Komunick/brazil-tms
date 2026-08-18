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
