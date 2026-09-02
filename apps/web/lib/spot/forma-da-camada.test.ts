import { readFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * A ESTEIRA PRECISA CENTRALIZAR QUANDO CABE — o guarda que nasceu de medir a tela (2026-09-02).
 *
 * A regra de POSIÇÃO escolhia `centro` corretamente e o cartão aparecia colado na esquerda: a camada
 * centraliza as linhas na vertical, mas a faixa horizontal, por rolar, empilha a partir do início.
 * Medido na produção: x=16 numa janela de 1707. Chegou como "no painel continuou aparecendo no
 * canto" — e a regra, que é o que este arquivo testa, estava certa o tempo todo.
 *
 * O guarda exige as DUAS metades, porque cada uma sozinha é um defeito:
 *
 *   · sem `safe`, o `center` corta o início da faixa quando os cartões transbordam, e os primeiros
 *     ficam inalcançáveis — não há como rolar para antes do começo;
 *   · sem `center`, volta o cartão na borda.
 */
describe("a faixa dos cartões centraliza sem quebrar a rolagem", () => {
  it("usa `safe center`, e não `center` puro nem o padrão", () => {
    const camada = readFileSync(
      join(__dirname, "../../components/spot/oferta-de-spot.tsx"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

    const faixa = /className="[^"]*overflow-x-auto[^"]*"/.exec(camada)?.[0];
    expect(faixa, "a faixa com rolagem sumiu — a esteira deixou de existir?").toBeTruthy();
    expect(
      faixa,
      "a faixa perdeu o `safe center`: ou o cartão volta para a borda esquerda, ou o `center` puro " +
        "corta os primeiros cartões quando a esteira precisa rolar.",
    ).toContain("[justify-content:safe_center]");
  });
});
