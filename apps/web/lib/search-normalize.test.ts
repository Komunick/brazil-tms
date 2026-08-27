import { describe, expect, it } from "vitest";
import { faltamLetras, normalizeForSearch } from "./search-normalize";

/** Pure unit tests for the 018 picker-search normalization (spec FR-002). */
describe("normalizeForSearch — text mode (names)", () => {
  it("strips diacritics and lowercases", () => {
    expect(normalizeForSearch("JOÃO da Silva Ções")).toBe("joao da silva coes");
  });

  it("trims and collapses internal whitespace (paste decoration)", () => {
    expect(normalizeForSearch("  João   da\tSilva  ")).toBe("joao da silva");
  });

  it("keeps hyphens in text mode (names may contain them)", () => {
    expect(normalizeForSearch("Maria Sousa-Leão")).toBe("maria sousa-leao");
  });

  it("normalized paste equals normalized label (US1 exact-match premise)", () => {
    expect(normalizeForSearch("joao da silva souza")).toBe(
      normalizeForSearch("João da Silva Souza"),
    );
  });
});

describe("normalizeForSearch — digits mode (phones)", () => {
  it("keeps digits only, whatever decoration the term carries", () => {
    for (const raw of ["(11) 99999-8888", "11 99999 8888", "+55 11 99999-8888 "]) {
      expect(normalizeForSearch(raw, "digits")).toContain("11999998888");
    }
  });

  it("a partial term stays a prefix of the stored phone (substring search)", () => {
    expect("11999998888".includes(normalizeForSearch("(11) 99999", "digits"))).toBe(true);
  });

  it("returns empty for a term with no digit (caller then searches the name only)", () => {
    expect(normalizeForSearch("João", "digits")).toBe("");
  });
});

describe("normalizeForSearch — plate mode", () => {
  it("ignores case, hyphens, and spaces", () => {
    for (const raw of ["ABC-1234", "abc 1234", "abc1234", " AbC-12 34 "]) {
      expect(normalizeForSearch(raw, "plate")).toBe("abc1234");
    }
  });

  it("distinguishes plates that differ by one character (SC-002)", () => {
    expect(normalizeForSearch("RTA1B23", "plate")).not.toBe(normalizeForSearch("RTA1B24", "plate"));
  });
});

/**
 * O MÍNIMO DE LETRAS antes de listar (2026-08-27).
 *
 * A regra é curta e o valor dela está em contar sobre o texto NORMALIZADO — é isso que faz "jo " e
 * "joã" se comportarem igual. Contar o texto cru foi a primeira ideia, e ela liberaria a busca com
 * um espaço a mais sem que nada tivesse sido digitado.
 */
describe("faltamLetras", () => {
  it("desligado por padrão — minChars 0 nunca segura nada", () => {
    expect(faltamLetras("", "text", 0)).toBe(false);
    expect(faltamLetras("a", "text", 0)).toBe(false);
  });

  it("segura enquanto faltam letras e libera na terceira", () => {
    expect(faltamLetras("", "text", 3)).toBe(true);
    expect(faltamLetras("jo", "text", 3)).toBe(true);
    expect(faltamLetras("joa", "text", 3)).toBe(false);
    expect(faltamLetras("joao", "text", 3)).toBe(false);
  });

  /** Espaço nas pontas e repetido não conta como letra — é o ponto da normalização. */
  it("não deixa espaço passar por letra", () => {
    expect(faltamLetras("jo ", "text", 3)).toBe(true);
    expect(faltamLetras("  jo  ", "text", 3)).toBe(true);
  });

  /** Acento também não muda a conta: "joã" tem três letras como "joa". */
  it("acento conta como uma letra só", () => {
    expect(faltamLetras("joã", "text", 3)).toBe(false);
    expect(faltamLetras("joão", "text", 3)).toBe(false);
  });

  /**
   * No modo placa, hífen e espaço somem — "ab-" tem duas letras úteis, não três. Sem isso um
   * campo de placa com mínimo liberaria a busca com um traço digitado por engano.
   */
  it("no modo placa, hífen não conta", () => {
    expect(faltamLetras("ab-", "plate", 3)).toBe(true);
    expect(faltamLetras("abc", "plate", 3)).toBe(false);
  });
});
