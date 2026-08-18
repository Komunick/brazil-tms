import { describe, expect, it } from "vitest";
import type { SpotOfferView } from "@brazil-tms/db";
import { estadoInicial, novasOfertas } from "./ofertas";

const oferta = (id: string): SpotOfertaTeste => ({
  id,
  portalTripId: `p-${id}`,
  tripNumber: `LT-${id}`,
  route: "SoC_BA_Simoes Filho  ->  LM Hub_SE_Aracaju_02",
  vehicle: "Truck",
  price: "R$ 4.548,30",
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
