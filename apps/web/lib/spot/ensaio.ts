"use client";

import type { SpotOfferView } from "@brazil-tms/db";

/**
 * O ENSAIO DO AVISO NA TELA (2026-08-24, a pedido).
 *
 * O botão da tela de Status prova que a mensagem chega no Telegram. Faltava provar o outro caminho:
 * o cartão que sobe no meio da tela, o som e o aviso do sistema — que é o que a sala vê.
 *
 * Ofertas são raras (de 3 a 21 por dia), então sem um ensaio a primeira notícia de que o som está
 * mudo, ou de que o cartão não sobe, vem no dia em que uma oferta boa passou e ninguém reagiu.
 *
 * ── NÃO GRAVA NADA, E É O PONTO ───────────────────────────────────────────────────────────────
 *
 * A oferta de ensaio não vai ao banco. Uma linha falsa em `spot_offers` entraria na contagem do
 * cartão do dia, no spot por frente do painel e em qualquer relatório futuro — e ninguém lembraria,
 * meses depois, que aquele número tem um teste dentro. O ensaio percorre exatamente o trecho que
 * pode falhar em silêncio (cartão, som, permissão de notificação) e para antes do que é histórico.
 *
 * O que ele NÃO cobre, e vale saber: o caminho robô → servidor → banco. Esse é coberto pela oferta
 * de verdade e pelo teste do Telegram, que sai do servidor.
 *
 * ── COMO CHEGA À TELA ─────────────────────────────────────────────────────────────────────────
 *
 * Por um evento do navegador, e não por estado compartilhado. O cartão vive no painel e o botão
 * pode ficar em qualquer tela; ligar os dois por contexto obrigaria a envolver a árvore inteira num
 * provedor que existe para um botão de teste. O evento atravessa a página sem acoplar ninguém.
 */

export const EVENTO_ENSAIO = "tms:ensaio-de-oferta";

/**
 * OS QUATRO ESTADOS DO CARTÃO, ensaiáveis (2026-09-01, fatia 030).
 *
 * O ensaio existia para provar que o cartão sobe, o som toca e a notificação sai. Com o cartão
 * ganhando decisão, ele passou a ter QUATRO caras — e três delas são as que ninguém vê até o dia em
 * que acontecem de verdade: a viagem que ainda não chegou, a ordem esperando o portal, e a recusa.
 *
 * A recusa é a mais importante de ensaiar: ela aconteceu 4 vezes em 17 ordens reais, e é a única
 * tela que alguém vê quando perde a corrida do leilão. Ensaiá-la é o único jeito de conferir que ela
 * diz o que precisa dizer sem esperar perder um frete.
 */
export const ESTADOS_DE_ENSAIO = ["esperando", "sem_viagem", "enviado", "recusado"] as const;

export type EstadoDeEnsaio = (typeof ESTADOS_DE_ENSAIO)[number];

/**
 * A oferta de mentira, marcada como tal em todo campo que aparece na tela.
 *
 * NENHUM ENSAIO PODE VIRAR ORDEM DE VERDADE, e a garantia é o `tripId` nulo: sem viagem não há a
 * quem endereçar a ordem, e a rota de aceite nem chega a ser chamada. Por isso `podeAceitar` é
 * verdadeiro no ensaio de "esperando" — para o botão APARECER e a confirmação poder ser exercitada —
 * enquanto o envio para no primeiro `if` do componente. O desenho se prova inteiro; o portal não é
 * tocado.
 */
export function ofertaDeEnsaio(estado: EstadoDeEnsaio = "esperando"): SpotOfferView {
  const agora = new Date();
  return {
    id: `ensaio-${agora.getTime()}`,
    /* A janela dos dez segundos: o ensaio nasce sem decisão. */
    decisao: null,
    portalTripId: `ensaio-${agora.getTime()}`,
    tripNumber: "TESTE",
    route: "ENSAIO DE AVISO  ->  ignore este cartão",
    vehicle: "teste",
    price: "R$ 0,00",
    originArrival: null,
    departure: null,
    arrival: null,
    operator: "disparado do TMS",
    receivedAt: agora.toISOString(),

    estado,
    // Sempre nulo — ver o comentário acima. É o que torna o ensaio incapaz de gastar.
    tripId: null,
    podeAceitar: estado === "esperando" || estado === "recusado",
    decidiuNome: estado === "enviado" ? "ensaio" : null,
    erroDoPortal:
      estado === "recusado"
        ? "portal retcode 131205003: Erro de sistema (4), erro de status de viagem. Tente novamente ou entre em contato com o gerente."
        : null,
  };
}

/** Dispara o ensaio. Quem escuta é a camada dos cartões, montada em toda tela do TMS. */
export function ensaiarAviso(estado: EstadoDeEnsaio = "esperando"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_ENSAIO, { detail: ofertaDeEnsaio(estado) }));
}
