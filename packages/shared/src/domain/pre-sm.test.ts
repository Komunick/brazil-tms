import { describe, expect, it } from "vitest";
import { donoEhPessoaFisica, vinculoParaLogae, vinculoSugerido } from "./pre-sm";

describe("vinculoParaLogae", () => {
  it("traduz os três vínculos escolhíveis", () => {
    expect(vinculoParaLogae("owned")).toBe("F");
    expect(vinculoParaLogae("agregado")).toBe("A");
    expect(vinculoParaLogae("terceiro")).toBe("T");
  });

  /**
   * O caso que justifica o arquivo.
   *
   * `subcontracted` significa "ainda não classificado", e 1.246 veículos estão assim. Chutar `A`
   * mandaria informação errada para quem faz escolta, e o erro seria invisível: a Pré-SM sairia, o
   * veículo rodaria, e ninguém saberia que a classificação era palpite nosso.
   */
  it("NÃO chuta para quem ainda não foi classificado", () => {
    expect(vinculoParaLogae("subcontracted")).toBeNull();
    expect(vinculoParaLogae(null)).toBeNull();
    expect(vinculoParaLogae(undefined)).toBeNull();
  });
});

describe("vinculoSugerido", () => {
  // O CNPJ da própria empresa, medido em 3 dos 40 veículos consultados.
  const NOSSO = "03571231000143";

  it("o CNPJ da própria empresa é frota própria", () => {
    expect(vinculoSugerido(NOSSO, NOSSO)).toBe("owned");
  });

  /**
   * Filial tem a mesma raiz e ordem diferente — um caminhão da filial continua sendo nosso.
   * Comparar os 14 dígitos inteiros classificaria a filial como "de fora".
   */
  it("compara pela raiz: filial também é nossa", () => {
    expect(vinculoSugerido("03571231000224", NOSSO)).toBe("owned");
  });

  it("CNPJ de outra empresa não recebe sugestão — agregado ou terceiro é decisão de gente", () => {
    expect(vinculoSugerido("53044902000196", NOSSO)).toBeNull();
  });

  it("pessoa física não recebe sugestão, mas nunca é frota própria", () => {
    expect(vinculoSugerido("00001932653546", NOSSO)).toBeNull();
    expect(donoEhPessoaFisica("00001932653546")).toBe(true);
  });

  it("sem dono, sem sugestão", () => {
    expect(vinculoSugerido(null, NOSSO)).toBeNull();
    expect(vinculoSugerido("", NOSSO)).toBeNull();
  });

  /**
   * Sem o CNPJ da empresa configurado, nada é "nosso" — e é o certo: sugerir frota própria sem
   * saber qual é a empresa classificaria o caminhão de um terceiro como nosso.
   */
  it("sem o CNPJ da empresa, ninguém é frota própria", () => {
    expect(vinculoSugerido(NOSSO, null)).toBeNull();
    expect(vinculoSugerido(NOSSO, "")).toBeNull();
  });

  it("aceita o CNPJ com pontuação, que é como ele costuma ser digitado", () => {
    expect(vinculoSugerido("03.571.231/0001-43", NOSSO)).toBe("owned");
  });
});

describe("donoEhPessoaFisica", () => {
  it("14 dígitos começando em zeros é CPF preenchido", () => {
    expect(donoEhPessoaFisica("00001932653546")).toBe(true);
    expect(donoEhPessoaFisica("00004179449501")).toBe(true);
  });

  it("CNPJ de empresa não é", () => {
    expect(donoEhPessoaFisica("53044902000196")).toBe(false);
    expect(donoEhPessoaFisica("03571231000143")).toBe(false);
  });

  it("vazio não é", () => {
    expect(donoEhPessoaFisica(null)).toBe(false);
    expect(donoEhPessoaFisica("")).toBe(false);
  });
});
