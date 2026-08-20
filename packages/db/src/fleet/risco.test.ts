import { describe, expect, it } from "vitest";
import { classifyRisk, MARGEM_MINUTOS } from "./fleet-positions";

/**
 * O "vai atrasar" que é NOSSO.
 *
 * O rastreador tem o alerta equivalente e ele não foi copiado: o dele compara contra o prazo que ELE
 * conhece — medido no JAX8F17, um caminhão a 94,62% do trajeto e chegando 18 minutos ANTES do prazo
 * dele aparecia laranja no mapa, por uma regra que não controlamos e que pode mudar sem aviso.
 *
 * Este compara contra a janela que o cliente publicou, que é o compromisso pelo qual a empresa
 * responde. Os casos abaixo trancam as três fronteiras e, principalmente, o quarto estado.
 */
const emMinutos = (base: Date, minutos: number) => new Date(base.getTime() + minutos * 60000);

describe("classifyRisk", () => {
  const eta = new Date("2026-08-20T12:00:00Z");

  it("folga larga é no prazo", () => {
    expect(classifyRisk(eta, emMinutos(eta, MARGEM_MINUTOS + 1))).toBe("no_prazo");
  });

  it("chegar depois da janela é atraso, não risco", () => {
    expect(classifyRisk(eta, emMinutos(eta, -1))).toBe("atrasada");
  });

  it("a margem apertada é o aviso — ainda cabe, mas por pouco", () => {
    expect(classifyRisk(eta, emMinutos(eta, MARGEM_MINUTOS - 1))).toBe("vai_atrasar");
  });

  it("exatamente na margem ainda é no prazo", () => {
    // A fronteira é declarada, não acidental: `< MARGEM` avisa, `= MARGEM` não. Sem este caso, um
    // refactor trocaria `<` por `<=` sem ninguém notar.
    expect(classifyRisk(eta, emMinutos(eta, MARGEM_MINUTOS))).toBe("no_prazo");
  });

  it("chegar exatamente no fim da janela não é atraso", () => {
    expect(classifyRisk(eta, eta)).toBe("vai_atrasar");
  });

  it('sem previsão ou sem janela é "não sei", nunca "está tudo bem"', () => {
    /**
     * Este é o caso que protege a tela de mentir. Um caminhão sem previsão do rastreador, ou uma
     * viagem sem janela publicada, não têm como ser avaliados — e pintar isso de verde seria
     * afirmar segurança sobre o que não se sabe.
     */
    expect(classifyRisk(null, eta)).toBe("sem_base");
    expect(classifyRisk(eta, null)).toBe("sem_base");
    expect(classifyRisk(null, null)).toBe("sem_base");
  });
});
