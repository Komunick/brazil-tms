import { describe, expect, it } from "vitest";
import { proximasFrentes } from "./frentes";

/**
 * O TETO DE DUAS FRENTES (2026-08-26, a pedido).
 *
 * O que estes testes protegem é o TERCEIRO clique. A implementação óbvia — ignorar o clique quando
 * já há duas — passa em qualquer teste que só verifique "nunca mais que duas", e dá um botão que
 * não faz nada. Por isso o caso do meio é afirmado pelo RESULTADO, e não pelo tamanho.
 */
describe("proximasFrentes", () => {
  it('"" é todas as frentes, e não nenhuma', () => {
    expect(proximasFrentes(["NONE", "SULCO"], "")).toEqual([]);
    expect(proximasFrentes([], "")).toEqual([]);
  });

  it("acrescenta enquanto couber", () => {
    expect(proximasFrentes([], "NONE")).toEqual(["NONE"]);
    expect(proximasFrentes(["NONE"], "SULCO")).toEqual(["NONE", "SULCO"]);
  });

  it("clicar de novo na mesma tira ela", () => {
    expect(proximasFrentes(["NONE", "SULCO"], "NONE")).toEqual(["SULCO"]);
    expect(proximasFrentes(["SULCO"], "SULCO")).toEqual([]);
  });

  it("o terceiro clique troca a MAIS ANTIGA — nunca é ignorado", () => {
    // NONE entrou primeiro, então é ela quem sai. O clique sempre responde.
    expect(proximasFrentes(["NONE", "SULCO"], "SUDESTE")).toEqual(["SULCO", "SUDESTE"]);
    // E de novo: agora SULCO é a mais antiga.
    expect(proximasFrentes(["SULCO", "SUDESTE"], "NONE")).toEqual(["SUDESTE", "NONE"]);
  });

  it("nunca passa de duas, em nenhum caminho", () => {
    let frentes: string[] = [];
    for (const f of ["NONE", "SULCO", "SUDESTE", "NONE", "SULCO", "SUDESTE"]) {
      frentes = proximasFrentes(frentes, f);
      expect(frentes.length).toBeLessThanOrEqual(2);
    }
  });

  it("não repete a mesma frente duas vezes na lista", () => {
    const frentes = proximasFrentes(proximasFrentes([], "NONE"), "NONE");
    expect(frentes).toEqual([]);
  });
});
