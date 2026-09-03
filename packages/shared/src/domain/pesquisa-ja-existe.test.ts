import { describe, expect, it } from "vitest";
import {
  decidirPedidoDePesquisa,
  pesquisaValida,
  type PesquisaEncontrada,
} from "./pesquisa-ja-existe";

/**
 * O GUARDA QUE IMPEDE PAGAR DUAS VEZES (2026-09-03).
 *
 * A gerenciadora **não bloqueia pesquisa repetida**: mandar duas vezes cria duas, e cada uma é
 * cobrada. Não há erro nem aviso do lado dela — a segunda simplesmente nasce. Este é o único lugar
 * onde isso pode ser impedido, e por isso ele é testado nos dois sentidos: bloquear demais é tão
 * ruim quanto bloquear de menos, porque um guarda que atrapalha acaba contornado.
 */
const HOJE = new Date("2026-09-03T12:00:00Z");

const p = (over: Partial<PesquisaEncontrada> = {}): PesquisaEncontrada => ({
  vinculo: "A",
  codigo: 8261167,
  situacao: "AD",
  dataExpiracao: "2027-03-01",
  ...over,
});

describe("decidirPedidoDePesquisa", () => {
  it("sem nenhuma pesquisa, pode pedir", () => {
    expect(decidirPedidoDePesquisa([], HOJE).podePedir).toBe(true);
  });

  /**
   * O CASO REAL que motivou tudo: o CPF 08389766469 tem pesquisa `AD` sob o vínculo A, válida até
   * 2027-03-01. Pedir de novo hoje é dinheiro jogado fora.
   */
  it("com uma adequada e dentro da validade, NÃO pode pedir", () => {
    const d = decidirPedidoDePesquisa([p()], HOJE);
    expect(d.podePedir).toBe(false);
    expect(d.motivo).toBe("ja_existe_valida");
    expect(d.bloqueadaPor?.codigo).toBe(8261167);
  });

  /**
   * O VÍNCULO NÃO PODE IMPORTAR NA DECISÃO — e é aqui que um guarda ingênuo falharia.
   *
   * A consulta da gerenciadora só acha a pesquisa se o vínculo bater. Quem pergunta só pelo vínculo
   * escolhido na hora ouve "não existe" e manda a segunda. A decisão recebe as três respostas, e
   * qualquer uma delas segura.
   */
  it("uma pesquisa em OUTRO vínculo segura o pedido do mesmo jeito", () => {
    const d = decidirPedidoDePesquisa([p({ vinculo: "A" })], HOJE);
    expect(d.podePedir).toBe(false);
    expect(d.bloqueadaPor?.vinculo).toBe("A");
  });

  describe("o que NÃO segura — e não segurar é tão importante quanto segurar", () => {
    it("expirada libera: refazer é o certo", () => {
      expect(decidirPedidoDePesquisa([p({ dataExpiracao: "2026-09-02" })], HOJE).podePedir).toBe(
        true,
      );
    });

    it("sem pesquisa libera", () => {
      expect(decidirPedidoDePesquisa([p({ situacao: "SP" })], HOJE).podePedir).toBe(true);
    });

    it("expirado pela situação libera", () => {
      expect(decidirPedidoDePesquisa([p({ situacao: "EX" })], HOJE).podePedir).toBe(true);
    });

    it("inconclusivo libera — é o caso em que refazer resolve", () => {
      expect(decidirPedidoDePesquisa([p({ situacao: "NA" })], HOJE).podePedir).toBe(true);
    });
  });

  describe("em andamento segura, e com motivo próprio", () => {
    for (const s of ["EP", "AP", "AC", "B"]) {
      it(`\`${s}\` segura`, () => {
        const d = decidirPedidoDePesquisa([p({ situacao: s, dataExpiracao: null })], HOJE);
        expect(d.podePedir).toBe(false);
        expect(d.motivo).toBe("ja_esta_em_andamento");
      });
    }
  });

  /**
   * A ORDEM IMPORTA: em andamento vence a resolvida, porque a frase que a tela mostra é diferente —
   * "espere terminar" e "já está aprovada até tal dia" pedem coisas diferentes de quem lê.
   */
  it("em andamento tem prioridade sobre a resolvida", () => {
    const d = decidirPedidoDePesquisa(
      [p({ situacao: "AD" }), p({ vinculo: "T", situacao: "EP" })],
      HOJE,
    );
    expect(d.motivo).toBe("ja_esta_em_andamento");
  });
});

describe("pesquisaValida", () => {
  it("sem data de expiração conta como válida", () => {
    // A gerenciadora só omite a data enquanto a pesquisa não terminou — e aí pedir outra é o
    // desperdício exato que este guarda existe para evitar.
    expect(pesquisaValida(p({ dataExpiracao: null }), HOJE)).toBe(true);
  });

  it("o último dia ainda vale", () => {
    expect(pesquisaValida(p({ dataExpiracao: "2026-09-03" }), HOJE)).toBe(true);
  });

  it("o dia seguinte não vale mais", () => {
    expect(pesquisaValida(p({ dataExpiracao: "2026-09-02" }), HOJE)).toBe(false);
  });

  it("data ilegível não segura — não dá para bloquear com base no que não se entendeu", () => {
    expect(pesquisaValida(p({ dataExpiracao: "sei lá" }), HOJE)).toBe(false);
  });
});
