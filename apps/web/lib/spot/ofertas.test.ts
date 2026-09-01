import { describe, expect, it } from "vitest";
import type { SpotOfferView } from "@brazil-tms/db";
import { enfileirar, estadoInicial, novasOfertas } from "./ofertas";

const oferta = (id: string): SpotOfertaTeste => ({
  id,
  portalTripId: `p-${id}`,
  tripNumber: `LT-${id}`,
  route: "SoC_BA_Simoes Filho  ->  LM Hub_SE_Aracaju_02",
  vehicle: "Truck",
  price: "R$ 4.548,30",
  // O STA da origem — a hora de comparecer, que é a que o cartão mostra.
  originArrival: "18/08 21:00",
  departure: "18/08 22:00",
  arrival: "19/08 06:00",
  operator: "fulano",
  receivedAt: "2026-08-18T14:00:00.000Z",

  /*
    O ESTADO DA DECISÃO NÃO INTERESSA A ESTE ARQUIVO, e é por isso que ele é fixo.

    `novasOfertas` e `enfileirar` respondem "o que é novidade?" e "em que ordem?", olhando só o `id`.
    Quem responde "dá para aceitar?" é `spot-decisao.ts`, que tem os testes dele. Variar o estado
    aqui só faria estes testes falharem por motivo que não é o deles.
  */
  estado: "esperando",
  tripId: `trip-${id}`,
  podeAceitar: true,
  decidiuNome: null,
  erroDoPortal: null,
});
type SpotOfertaTeste = SpotOfferView;

describe("novasOfertas", () => {
  it("a PRIMEIRA resposta não anuncia nada — ela é um retrato", () => {
    /**
     * É o caso que mais importa: esta tela recarrega sozinha quando a rede volta. Sem isto, toda
     * queda de madrugada terminaria com a TV disparando todas as ofertas ainda em leilão.
     */
    const estado = estadoInicial();
    expect(novasOfertas(estado, [oferta("a"), oferta("b")])).toEqual([]);
  });

  it("da segunda em diante, id novo é aviso", () => {
    const estado = estadoInicial();
    novasOfertas(estado, [oferta("a")]);
    const novas = novasOfertas(estado, [oferta("b"), oferta("a")]);
    expect(novas.map((o) => o.id)).toEqual(["b"]);
  });

  it("a mesma oferta não é anunciada duas vezes", () => {
    // A resposta traz uma janela de dez minutos, então a mesma oferta reaparece em ~20 ciclos.
    const estado = estadoInicial();
    novasOfertas(estado, [oferta("a")]);
    novasOfertas(estado, [oferta("b"), oferta("a")]);
    expect(novasOfertas(estado, [oferta("b"), oferta("a")])).toEqual([]);
  });

  it("várias de uma vez saem na ordem em que chegaram", () => {
    // A resposta vem da mais nova para a mais antiga; a fila da tela conta na ordem dos fatos.
    const estado = estadoInicial();
    novasOfertas(estado, [oferta("a")]);
    const novas = novasOfertas(estado, [oferta("c"), oferta("b"), oferta("a")]);
    expect(novas.map((o) => o.id)).toEqual(["b", "c"]);
  });

  it("lista vazia não zera a memória", () => {
    const estado = estadoInicial();
    novasOfertas(estado, [oferta("a")]);
    novasOfertas(estado, []);
    expect(novasOfertas(estado, [oferta("a")])).toEqual([]);
  });
});

/**
 * A FILA (2026-08-27, a pedido).
 *
 * Aqui viviam os testes da REGRA DA RAJADA — a que deixava subir só a primeira oferta depois de um
 * silêncio e mandava as outras caladas para a caixa. Ela saiu inteira: na tela de verdade, três
 * ofertas seguidas produziram um apito só, e as duas que ficaram na caixa passaram sem ninguém ver.
 *
 * O que sobra é uma fila simples, e o que ela precisa garantir é uma coisa só: nada entra duas
 * vezes. Cada linha da fila vira um apito, então um id repetido é um apito repetido.
 */
describe("enfileirar", () => {
  it("as novas entram no fim, preservando a ordem", () => {
    const fila = enfileirar([oferta("a")], [oferta("b"), oferta("c")]);
    expect(fila.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("id que já está na fila não entra de novo", () => {
    const fila = enfileirar([oferta("a"), oferta("b")], [oferta("b"), oferta("c")]);
    expect(fila.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  /** A rajada de sexta agora entra INTEIRA — é o pedido, e é o que mudou. */
  it("trinta ofertas seguidas viram trinta lugares na fila", () => {
    let fila = enfileirar([], []);
    for (let i = 0; i < 30; i++) fila = enfileirar(fila, [oferta(`o${i}`)]);
    expect(fila).toHaveLength(30);
  });

  it("sem oferta nova, a fila fica como estava", () => {
    const antes = [oferta("a")];
    expect(enfileirar(antes, []).map((o) => o.id)).toEqual(["a"]);
  });
});
