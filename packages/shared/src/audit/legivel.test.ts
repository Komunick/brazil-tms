import { describe, expect, it } from "vitest";
import { linhasDaAuditoria } from "./legivel";

const dic = {
  status: (k: string) =>
    ({ assigned: "Atribuída", confirmed: "Confirmada", at_origin: "Na origem" })[k] ?? null,
};

describe("o que a operação via antes", () => {
  /** O caso exato que o usuário mostrou, cortado no meio da chave pelo `truncate`. */
  it('{"hops":["confirmed","at_origin"],"current_status":"at_origin"} vira frase', () => {
    const linhas = linhasDaAuditoria(
      { hops: ["confirmed", "at_origin"], current_status: "at_origin" },
      dic,
    );
    expect(linhas).toEqual([
      { rotulo: "Status", valor: "Na origem" },
      { rotulo: "Passos", valor: "Confirmada → Na origem" },
    ]);
  });

  it('{"current_status":"assigned"} vira "Status: Atribuída"', () => {
    expect(linhasDaAuditoria({ current_status: "assigned" }, dic)).toEqual([
      { rotulo: "Status", valor: "Atribuída" },
    ]);
  });
});

describe("a sequência de passos", () => {
  it("usa seta, porque hops tem ORDEM — vírgula leria como conjunto", () => {
    const [linha] = linhasDaAuditoria({ hops: ["confirmed", "at_origin"] }, dic);
    expect(linha!.valor).toBe("Confirmada → Na origem");
  });

  it("lista sem ordem continua com vírgula", () => {
    const [linha] = linhasDaAuditoria({ plates: ["ABC1D23", "XYZ4E56"] });
    expect(linha!.valor).toBe("ABC1D23, XYZ4E56");
  });
});

describe("o desfecho da ação no portal", () => {
  it("achata o objeto aninhado numa linha legível", () => {
    const linhas = linhasDaAuditoria({
      desfecho: "confirmado no portal",
      conferencia: { confirmado: true, detalhe: "o portal mostra a placa BDM3G50" },
      segundos: 0.7,
    });
    expect(linhas[0]).toEqual({ rotulo: "Desfecho", valor: "confirmado no portal" });
    expect(linhas[1]!.valor).toBe("Confirmado: sim · Detalhe: o portal mostra a placa BDM3G50");
    expect(linhas[2]).toEqual({ rotulo: "Tempo", valor: "0.7s" });
  });

  it("placas numa string só ganham espaço depois da vírgula", () => {
    const [linha] = linhasDaAuditoria({ placasEnviadas: "NZZ7H06,OLD2A88" });
    expect(linha!.valor).toBe("NZZ7H06, OLD2A88");
  });
});

describe("o que NÃO se esconde", () => {
  /**
   * Sumir com campo desconhecido faria a auditoria mentir por omissão no dia em que alguém gravasse
   * algo novo e esquecesse de traduzir. O nome cru é feio e honesto.
   */
  it("campo sem tradução aparece com o nome cru, no fim", () => {
    const linhas = linhasDaAuditoria({ campo_novo_qualquer: "x", current_status: "assigned" }, dic);
    expect(linhas[0]!.rotulo).toBe("Status");
    expect(linhas[1]).toEqual({ rotulo: "campo_novo_qualquer", valor: "x" });
  });

  it("nulo vira travessão, não some", () => {
    expect(linhasDaAuditoria({ remark: null })).toEqual([{ rotulo: "Observação", valor: "—" }]);
  });

  it("valor vazio nunca desenha uma linha em branco", () => {
    expect(linhasDaAuditoria({ remark: "" })).toEqual([{ rotulo: "Observação", valor: "—" }]);
  });
});

describe("sem valor", () => {
  it("null devolve lista vazia — quem chama mostra o traço", () => {
    expect(linhasDaAuditoria(null)).toEqual([]);
  });
});

describe("o leilão de spot", () => {
  it("preço em centavos vira reais — o erro de 100x é o que este teste existe para pegar", () => {
    const [linha] = linhasDaAuditoria({ preco: 250000 });
    expect(linha!.rotulo).toBe("Preço");
    // R$ 2.500,00 — e NÃO "250000", que se leria como duzentos e cinquenta mil.
    expect(linha!.valor).toMatch(/2\.500,00/);
    expect(linha!.valor).not.toContain("250000");
  });

  it("sem preço não inventa zero", () => {
    expect(linhasDaAuditoria({ preco: null })).toEqual([{ rotulo: "Preço", valor: "—" }]);
  });

  it("a rota vem antes da oferta — é ela que diz se a ausência era esperada", () => {
    const linhas = linhasDaAuditoria({
      ofertaDeSpot: "nenhuma",
      rota: "SoC_RJ_Jacarepagua -> SoC_BA_Simoes Filho",
    });
    expect(linhas.map((l) => l.rotulo)).toEqual(["Rota", "Oferta de spot"]);
  });
});
