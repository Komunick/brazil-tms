import { describe, expect, it } from "vitest";
import { aoRecolher, formaDaCamada, type FormaDaCamada } from "./forma-da-camada";

/**
 * A REGRA DA POSIÇÃO, provada nos casos que a operação vive (2026-09-01, fatia 030).
 *
 * Ela é uma função pura de propósito: a posição do cartão é a decisão mais fácil de quebrar sem
 * ninguém ver, porque só se percebe olhando a tela certa com a pessoa certa logada. Aqui as quatro
 * combinações ficam escritas.
 */

const base = { padrao: "popup", escolhida: null, dialogoAberto: false } as const;

describe("onde o cartão se põe", () => {
  it("o meio da tela é só do Painel do dia de quem decide", () => {
    expect(formaDaCamada({ ...base, padrao: "centro" })).toBe("centro");
  });

  it("quem não decide recebe a mesma oferta no canto, e não no meio", () => {
    expect(formaDaCamada(base)).toBe("popup");
  });

  /**
   * O CASO QUE A FATIA VEIO CONSERTAR. Sem a guarda do `centro`, bastaria um `escolhida` antigo — de
   * um estado guardado, de uma volta de navegação — para devolver o meio da tela a quem não decide.
   */
  it("quem não tem o centro por padrão não chega nele escolhendo", () => {
    expect(formaDaCamada({ ...base, escolhida: "centro" })).toBe("popup");
  });

  it("o centro escolhido vale para quem tem direito a ele", () => {
    expect(formaDaCamada({ ...base, padrao: "centro", escolhida: "centro" })).toBe("centro");
  });

  describe("o diálogo aberto", () => {
    it("encolhe o cartão de quem estava com ele no meio", () => {
      expect(formaDaCamada({ padrao: "centro", escolhida: null, dialogoAberto: true })).toBe(
        "pastilha",
      );
    });

    /**
     * A ESCOLHA NÃO É APAGADA, só suspensa — é o que faz o cartão voltar sozinho quando o diálogo
     * fecha. Um código que zerasse `escolhida` ao abrir o diálogo deixaria quem tinha recolhido de
     * propósito com o cartão de volta na cara ao terminar de atribuir.
     */
    it("devolve a MESMA forma de antes quando fecha", () => {
      const escolhida: FormaDaCamada = "popup";
      expect(formaDaCamada({ padrao: "centro", escolhida, dialogoAberto: true })).toBe("pastilha");
      expect(formaDaCamada({ padrao: "centro", escolhida, dialogoAberto: false })).toBe("popup");
    });
  });
});

describe("recolher encolhe um passo por vez", () => {
  it("centro → popup → pastilha", () => {
    expect(aoRecolher("centro")).toBe("popup");
    expect(aoRecolher("popup")).toBe("pastilha");
  });

  it("da pastilha não encolhe mais — ela é o piso", () => {
    expect(aoRecolher("pastilha")).toBe("pastilha");
  });
});
