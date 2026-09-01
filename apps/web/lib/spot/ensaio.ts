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

/** A oferta de mentira, marcada como tal em todo campo que aparece na tela. */
export function ofertaDeEnsaio(): SpotOfferView {
  const agora = new Date();
  return {
    id: `ensaio-${agora.getTime()}`,
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

    /*
      A OFERTA DE ENSAIO NÃO TEM VIAGEM, e o estado diz isso em vez de fingir (2026-09-01).

      Ela é inventada aqui, no navegador; não existe LH nenhuma no portal com este número. `sem_viagem`
      é a verdade, e é também o estado mais seguro: com ele o botão de aceitar nasce desligado, então
      nenhum ensaio pode virar uma ordem de verdade por engano.

      A fatia 030 prevê o ensaio cobrir os quatro estados (ver tasks T054). Enquanto isso não chega,
      este é o único que não mente.
    */
    estado: "sem_viagem",
    tripId: null,
    podeAceitar: false,
    decidiuNome: null,
    erroDoPortal: null,
  };
}

/** Dispara o ensaio. Quem escuta é o cartão de oferta, no painel. */
export function ensaiarAviso(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_ENSAIO, { detail: ofertaDeEnsaio() }));
}
