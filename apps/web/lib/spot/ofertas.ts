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
 * UM AVISO POR RAJADA (2026-08-21, a pedido, depois de um teste com 30 ofertas).
 *
 * Toda sexta chegam mais de cinquenta ofertas em sequência, uma a uma. O aviso ocupa o meio da tela
 * por trinta segundos, e a primeira versão desta regra só evitava a FILA — passados os trinta
 * segundos, a oferta seguinte encontrava a tela livre e virava aviso de novo. No teste, 30 ofertas em
 * 89 segundos viraram três cartões. O pedido era um.
 *
 * ── A PERGUNTA CERTA ───────────────────────────────────────────────────────────────────────────
 *
 * Não é "tem cartão na tela?" — é "isto é o COMEÇO de uma rajada, ou a continuação de uma?".
 *
 * Uma oferta começa rajada quando vem depois de um silêncio. Vindo na esteira de outra, é
 * continuação: entra na caixa e não interrompe. O silêncio é o que separa os dois, e é a única
 * medida que não precisa saber quantas ofertas virão nem que dia é hoje.
 *
 * ── POR QUE NÃO É INTERVALO FIXO ENTRE AVISOS ──────────────────────────────────────────────────
 *
 * "No máximo um aviso a cada dez minutos" resolveria a sexta e estragaria a terça: duas ofertas
 * legítimas separadas por oito minutos são dois avisos legítimos. O silêncio antes da oferta
 * descreve o que está acontecendo; o relógio desde o último aviso, não.
 *
 * ── NADA SE PERDE ──────────────────────────────────────────────────────────────────────────────
 *
 * A caixa de ofertas do dia mostra TODAS, com a lista completa e clicável. E o cartão diz quantas
 * absorveu — sem isso o corte seria invisível, e quem sabe que a sexta traz cinquenta veria uma só e
 * concluiria que está perdendo as outras.
 */

/** O silêncio que separa uma rajada da seguinte. Três minutos: mais que o aviso, menos que um café. */
export const SILENCIO_ENTRE_RAJADAS_MS = 3 * 60_000;

export interface DecisaoDeAviso {
  /** A oferta que vai para a tela, ou `null` quando é continuação de rajada. */
  anunciar: SpotOfferView | null;
  /** Quantas foram para a caixa sem passar pela tela. */
  absorvidas: number;
}

export function decidirAviso(
  temCartaoNaTela: boolean,
  novas: readonly SpotOfferView[],
  msDesdeAUltimaOferta: number,
): DecisaoDeAviso {
  if (novas.length === 0) return { anunciar: null, absorvidas: 0 };
  const comecaRajada = msDesdeAUltimaOferta >= SILENCIO_ENTRE_RAJADAS_MS;
  // Cartão na tela OU continuação de rajada: tudo vai para a caixa, sem interromper.
  if (temCartaoNaTela || !comecaRajada) return { anunciar: null, absorvidas: novas.length };
  // Começo de rajada com a tela livre: a mais antiga sobe, as outras acumulam.
  return { anunciar: novas[0] ?? null, absorvidas: Math.max(0, novas.length - 1) };
}
