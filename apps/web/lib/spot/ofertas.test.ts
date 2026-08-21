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

const SILENCIO = 3 * 60_000;
/** Muito silêncio antes: esta oferta COMEÇA uma rajada. */
const DEPOIS_DE_SILENCIO = SILENCIO + 1;
/** Chegou na esteira da anterior: é continuação. */
const NA_ESTEIRA = 3_000;

/**
 * A SEXTA-FEIRA (2026-08-21, a pedido, e corrigido depois de um teste com 30 ofertas reais).
 *
 * Toda sexta chegam mais de cinquenta ofertas em sequência, uma a uma — o monitor manda assim. Com
 * um aviso de trinta segundos por oferta, são vinte e cinco minutos de tela ocupada.
 *
 * A PRIMEIRA versão desta regra só evitava a fila: passados os trinta segundos do cartão, a oferta
 * seguinte encontrava a tela livre e virava aviso de novo. O teste com 30 ofertas em 89 segundos
 * produziu TRÊS cartões. O pedido era um.
 *
 * A pergunta certa não é "tem cartão na tela?" — é "isto começa uma rajada ou continua uma?". Uma
 * oferta começa rajada quando vem depois de um silêncio; vindo na esteira de outra, é continuação.
 */
describe("decidirAviso", () => {
  it("depois de um silêncio, a oferta sobe: começa uma rajada", () => {
    const d = decidirAviso(false, [oferta("a")], DEPOIS_DE_SILENCIO);
    expect(d.anunciar?.id).toBe("a");
    expect(d.absorvidas).toBe(0);
  });

  /** O caso que a primeira versão errava: tela livre, mas a rajada continua. */
  it("na esteira da anterior NÃO sobe, mesmo com a tela livre", () => {
    const d = decidirAviso(false, [oferta("b")], NA_ESTEIRA);
    expect(d.anunciar).toBeNull();
    expect(d.absorvidas).toBe(1);
  });

  it("com um cartão na tela, nada sobe", () => {
    const d = decidirAviso(true, [oferta("c")], DEPOIS_DE_SILENCIO);
    expect(d.anunciar).toBeNull();
    expect(d.absorvidas).toBe(1);
  });

  /**
   * A SEXTA INTEIRA: 30 ofertas de 3 em 3 segundos produzem UM aviso. É o teste que reproduz o
   * disparo real feito no dev — 30 ofertas em 89 segundos.
   */
  it("trinta ofertas em sequência produzem UM aviso", () => {
    let avisos = 0;
    let naCaixa = 0;
    let temCartao = false;
    for (let i = 0; i < 30; i++) {
      // A primeira vem depois do silêncio da madrugada; as outras, de 3 em 3 segundos.
      const silencio = i === 0 ? DEPOIS_DE_SILENCIO : NA_ESTEIRA;
      const d = decidirAviso(temCartao, [oferta(`o${i}`)], silencio);
      if (d.anunciar) {
        avisos += 1;
        temCartao = true;
      }
      naCaixa += d.absorvidas;
      // O cartão sai depois de 30s — dez ofertas de 3 em 3. A rajada continua depois disso.
      if (i === 10) temCartao = false;
    }
    expect(avisos).toBe(1);
    expect(naCaixa).toBe(29);
  });

  it("a rajada com a tela ocupada vai inteira para a caixa", () => {
    expect(decidirAviso(true, [oferta("a"), oferta("b"), oferta("c")], NA_ESTEIRA)).toEqual({
      anunciar: null,
      absorvidas: 3,
    });
  });

  it("sem oferta nova, não decide nada", () => {
    expect(decidirAviso(false, [], DEPOIS_DE_SILENCIO)).toEqual({ anunciar: null, absorvidas: 0 });
  });

  /**
   * O DIA NORMAL NÃO MUDA. Ofertas espaçadas vêm sempre depois de silêncio, então cada uma começa
   * a própria rajada e sobe — quem opera numa terça não percebe que esta regra existe.
   */
  it("num dia espaçado, toda oferta continua subindo", () => {
    for (const id of ["a", "b", "c"]) {
      const d = decidirAviso(false, [oferta(id)], DEPOIS_DE_SILENCIO);
      expect(d.anunciar?.id).toBe(id);
      expect(d.absorvidas).toBe(0);
    }
  });
});
