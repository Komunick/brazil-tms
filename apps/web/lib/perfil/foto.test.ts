import { describe, expect, it } from "vitest";
import { iniciaisDe } from "./foto";

/**
 * AS INICIAIS DE QUEM NÃO TEM FOTO (FR-020).
 *
 * O requisito diz "distinguíveis entre pessoas — nunca um mesmo ícone genérico para todos", e é aí
 * que mora a decisão testada aqui: PRIMEIRA e ÚLTIMA palavra, não as duas primeiras.
 *
 * Numa lista de trinta linhas, iniciais que se repetem valem tanto quanto o ícone genérico que o
 * requisito proíbe. Os nomes abaixo são reais o bastante para o caso importar: numa empresa há mais
 * "Maria" e "João" repetidos no primeiro nome do que no último.
 */
describe("iniciaisDe", () => {
  it("usa a primeira e a ÚLTIMA palavra", () => {
    expect(iniciaisDe("Anderson Paixão")).toBe("AP");
    expect(iniciaisDe("Maria Duda Ferreira")).toBe("MF");
  });

  it("distingue quem compartilha os dois primeiros nomes", () => {
    /**
     * É este caso que decide a regra. Pelas duas PRIMEIRAS palavras, as duas seriam "MD" — e a
     * inicial deixaria de distinguir exatamente onde ela mais precisa, que é entre pessoas de nome
     * parecido.
     */
    expect(iniciaisDe("Maria Duda Ferreira")).not.toBe(iniciaisDe("Maria Duda Souza"));
  });

  it("nome de uma palavra só devolve uma letra", () => {
    // Melhor uma letra do que repetir a mesma duas vezes: "WW" pareceria sobrenome que não existe.
    expect(iniciaisDe("Weslley")).toBe("W");
  });

  it("aguenta espaço a mais, e nome vazio não quebra a tela", () => {
    expect(iniciaisDe("  João   da   Silva  ")).toBe("JS");
    expect(iniciaisDe("")).toBe("?");
    expect(iniciaisDe("   ")).toBe("?");
  });

  it("sempre em maiúsculas", () => {
    expect(iniciaisDe("victor teixeira")).toBe("VT");
  });
});
