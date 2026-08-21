import { describe, expect, it } from "vitest";
import type { SpotOfferView } from "@brazil-tms/db";
import { decidirAviso, estadoInicial, novasOfertas } from "./ofertas";

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
 * A SEXTA-FEIRA (2026-08-21, a pedido).
 *
 * Toda sexta chegam mais de cinquenta ofertas em sequência, e o monitor manda UMA A UMA — cada busca
 * acha uma nova. Com um aviso de trinta segundos por oferta, são vinte e cinco minutos de tela
 * ocupada, com som a cada uma. Numa sala onde a TV serve para olhar de relance, isso deixa de ser
 * aviso e vira ruído que a operação aprende a ignorar.
 *
 * A regra NÃO consulta o calendário, e isso é deliberado: ela age quando a tela está ocupada, o que
 * na prática só acontece na sexta. Amarrar no dia criaria dois defeitos — pico numa quinta voltaria a
 * spammar, e sexta calma engoliria uma oferta legítima.
 */
describe("decidirAviso", () => {
  it("com a tela livre, a oferta sobe", () => {
    const d = decidirAviso(false, [oferta("a")]);
    expect(d.anunciar?.id).toBe("a");
    expect(d.absorvidas).toBe(0);
  });

  it("com um cartão na tela, a nova vai para a caixa e NÃO interrompe", () => {
    const d = decidirAviso(true, [oferta("b")]);
    expect(d.anunciar).toBeNull();
    expect(d.absorvidas).toBe(1);
  });

  /** A rajada inteira numa busca só: uma sobe, o resto acumula — nunca uma fila de cinquenta. */
  it("várias na mesma busca: a primeira sobe, as outras acumulam", () => {
    const d = decidirAviso(false, [oferta("a"), oferta("b"), oferta("c")]);
    expect(d.anunciar?.id).toBe("a");
    expect(d.absorvidas).toBe(2);
  });

  it("a rajada com a tela ocupada vai inteira para a caixa", () => {
    expect(decidirAviso(true, [oferta("a"), oferta("b"), oferta("c")])).toEqual({
      anunciar: null,
      absorvidas: 3,
    });
  });

  it("sem oferta nova, não decide nada", () => {
    expect(decidirAviso(false, [])).toEqual({ anunciar: null, absorvidas: 0 });
    expect(decidirAviso(true, [])).toEqual({ anunciar: null, absorvidas: 0 });
  });

  /**
   * O dia normal não muda. Ofertas espaçadas encontram a tela livre, uma de cada vez — quem opera
   * numa terça não percebe que esta regra existe.
   */
  it("num dia espaçado, toda oferta continua subindo", () => {
    for (const id of ["a", "b", "c"]) {
      const d = decidirAviso(false, [oferta(id)]);
      expect(d.anunciar?.id).toBe(id);
      expect(d.absorvidas).toBe(0);
    }
  });
});
