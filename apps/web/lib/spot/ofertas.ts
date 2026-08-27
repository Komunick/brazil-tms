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
 * TODA OFERTA APITA, UMA DE CADA VEZ (2026-08-27, a pedido).
 *
 * ── O QUE HAVIA AQUI, E POR QUE SAIU ──────────────────────────────────────────────────────────
 *
 * Havia a REGRA DA RAJADA: a primeira oferta depois de três minutos de silêncio subia à tela, e
 * tudo o que viesse na esteira dela ia calado para a caixa. Ela nasceu de um teste com 30 ofertas
 * e da sexta-feira que traz cinquenta.
 *
 * O que ela custava só apareceu na tela de verdade: três ofertas chegaram seguidas e a sala ouviu
 * UM apito. As outras duas existiam na caixa, mas ninguém abre a caixa por conta própria — o apito
 * é o que faz alguém olhar, e sem ele a oferta passou como se não tivesse chegado.
 *
 * ── A REGRA AGORA ─────────────────────────────────────────────────────────────────────────────
 *
 * Toda oferta nova entra na FILA. Uma fica na tela por vez, com som e aviso de sistema próprios;
 * quando os trinta segundos dela acabam, a seguinte sobe e apita também. Nenhuma é engolida.
 *
 * O CUSTO É CONHECIDO e foi aceito: numa rajada de cinquenta, a última sobe vinte e cinco minutos
 * depois de chegar. É por isso que o cartão mostra quantas ainda esperam — quem vê "+12" sabe que
 * a fila é longa e pode ir direto à caixa de ofertas do dia, que continua tendo todas.
 */

/**
 * Põe as novas no FIM da fila, sem repetir o que já está nela.
 *
 * A guarda de id não é teórica: o ensaio entra pela frente da fila e a busca continua correndo por
 * baixo. Sem ela, uma oferta que chegasse duas vezes apitaria duas vezes — que é exatamente o
 * defeito oposto ao que este arquivo acabou de consertar.
 */
export function enfileirar(
  fila: readonly SpotOfferView[],
  novas: readonly SpotOfferView[],
): SpotOfferView[] {
  const jaNaFila = new Set(fila.map((o) => o.id));
  return [...fila, ...novas.filter((o) => !jaNaFila.has(o.id))];
}
