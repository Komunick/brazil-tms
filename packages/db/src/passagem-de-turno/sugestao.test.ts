import { describe, expect, it } from "vitest";
import { dobrarAcento } from "./sugestao";

/**
 * A DOBRA DE ACENTO — o que decide se o motorista é encontrado (2026-08-27).
 *
 * ── POR QUE ELA VIVE EM JAVASCRIPT ────────────────────────────────────────────────────────────
 *
 * O jeito natural seria `unaccent()` no Postgres. A extensão NÃO está instalada neste banco —
 * nenhuma migração roda `CREATE EXTENSION` e nada no repositório a usa. A consulta falharia com
 * `function unaccent(text) does not exist`, em produção, no primeiro uso: a mesma classe de defeito
 * que derrubou a aba da Programação em 26/08, e que se descobre olhando antes em vez de supondo.
 *
 * ── O REGEX É O PONTO FRÁGIL ──────────────────────────────────────────────────────────────────
 *
 * A faixa `̀-ͯ` são marcas combinantes — INVISÍVEIS no editor. Escritas literalmente,
 * qualquer ferramenta que "normalize" o arquivo as apaga e o regex vira `/[-]/`, que não dobra nada
 * e não reclama. Escapadas, sobrevivem. Este teste é o que prova que ainda funciona.
 */
describe("a comparação de nome de motorista", () => {
  it("iguala o mesmo nome com e sem acento", () => {
    expect(dobrarAcento("JEFERSON CONCEIÇÃO DA SILVA")).toBe(
      dobrarAcento("Jeferson Conceicao da Silva"),
    );
  });

  it("ignora caixa, espaço repetido e espaço nas pontas", () => {
    expect(dobrarAcento("  João   Vitor  Fidélis ")).toBe("joao vitor fidelis");
  });

  it("cobre os acentos do português", () => {
    expect(dobrarAcento("ÁÀÂÃÉÊÍÓÔÕÚÜÇ")).toBe("aaaaeeiooouuc");
  });

  /**
   * Nomes DIFERENTES não podem colidir — a dobra tira acento, não letra. Se colidissem, a regra do
   * "só sugere quando casa com um só" passaria a recusar sugestões legítimas.
   */
  it("não junta nomes que são de pessoas diferentes", () => {
    expect(dobrarAcento("Ricardo de Lima")).not.toBe(dobrarAcento("Ricardo de Lima Oliveira"));
    expect(dobrarAcento("Silva")).not.toBe(dobrarAcento("Silveira"));
  });
});
