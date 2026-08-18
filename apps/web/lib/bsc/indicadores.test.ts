import { describe, expect, it } from "vitest";
import { faixaDo, indicadoresNaTela, ORDEM_BSC, PREMISSAS } from "./indicadores";

/**
 * O defeito que estes testes existem para não repetir: o painel mostrava SEIS indicadores enquanto o
 * banco guardava os vinte que a Shopee publica, e nada na tela dizia que faltava algo.
 */

/** Uma leitura como o robô entrega: os vinte rótulos do painel KPI, com valor. */
const VINTE: Record<string, number> = Object.fromEntries(ORDEM_BSC.map((nome) => [nome, 100]));

describe("indicadoresNaTela", () => {
  it("mostra TODOS os que vieram na leitura, não um recorte", () => {
    expect(indicadoresNaTela(VINTE)).toHaveLength(20);
  });

  it("segue a ordem do próprio BSC, pilar a pilar", () => {
    // Quem confere o TMS contra a tela do cliente lê na mesma sequência. Cada fileira de quatro é um
    // pilar, exatamente como o relatório desenha.
    expect(indicadoresNaTela(VINTE).slice(0, 4)).toEqual([
      "Scheduling",
      "Tendência",
      "SPOT",
      "Aderência de Perfil",
    ]);
    expect(indicadoresNaTela(VINTE).slice(4, 8).map((n) => PREMISSAS[n]!.pilar)).toEqual([
      "FIELD",
      "FIELD",
      "FIELD",
      "FIELD",
    ]);
  });

  it("indicador que a Shopee inventar aparece no fim, e não some", () => {
    /**
     * A ordem é uma preferência, nunca um filtro. O scorecard é revisado pelo cliente (o relatório já
     * se chama "V3"), e um rótulo novo caindo fora da tela seria o mesmo defeito de novo — desta vez
     * mais difícil de perceber, porque ninguém procura o que não sabe que existe.
     */
    const comNovo = { ...VINTE, "Indicador Novo V4": 42 };
    const nomes = indicadoresNaTela(comNovo);
    expect(nomes).toHaveLength(21);
    expect(nomes.at(-1)).toBe("Indicador Novo V4");
  });

  it("o que não veio na leitura não vira cartão vazio", () => {
    // Indicador em branco no BSC chega ausente, e um cartão com "—" seria inventar um dado que o
    // cliente não publicou.
    expect(indicadoresNaTela({ SPOT: 90.91, Telemetria: 26.83 })).toEqual(["SPOT", "Telemetria"]);
  });
});

describe("faixaDo — as três cores do BSC", () => {
  /**
   * Os casos são os NÚMEROS REAIS da tela do cliente em 18/08, com a cor que ela mostrava. Não são
   * exemplos inventados: é o que torna este teste capaz de acusar uma regra que se afastou do BSC.
   */
  const medidos: Array<[string, number, string]> = [
    ["Scheduling", 102.27, "acima"], // meta 100 — verde
    ["Tendência", 94.23, "atencao"], // mínimo 93, meta 95 — amarelo
    ["ETA Origem", 99.04, "acima"], // meta 99 — verde no limite
    ["ETA Destino", 83.61, "abaixo"], // mínimo 93 — vermelho
    ["Telemetria", 57.71, "abaixo"],
    ["Training", 98.88, "acima"], // meta 98
    ["Ocorrência - Quebra", 98.68, "atencao"], // mínimo 97,5, meta 99,5
    ["No Show", 99.75, "acima"],
    ["Acidente Fatal", 100, "acima"], // meta 0: conformidade, e a regra normal já acerta
  ];

  for (const [nome, valor, esperado] of medidos) {
    it(`${nome} ${valor}% → ${esperado}`, () => {
      expect(faixaDo(valor, PREMISSAS[nome])).toBe(esperado);
    });
  }

  it("exatamente no mínimo é amarelo; um fio abaixo é vermelho", () => {
    // O limite é o lugar onde regra de faixa erra, e errar aqui pinta de verde uma operação que o
    // cliente considera reprovada.
    expect(faixaDo(93, PREMISSAS["Tendência"])).toBe("atencao");
    expect(faixaDo(92.99, PREMISSAS["Tendência"])).toBe("abaixo");
    expect(faixaDo(95, PREMISSAS["Tendência"])).toBe("acima");
  });

  it("indicador sem premissa fica SEM cor, nunca com alvo inventado", () => {
    // É a regra que o painel segue desde o começo: número sem piso conhecido aparece cru. Pintar de
    // verde por otimismo, ou de vermelho por prudência, seria inventar uma avaliação do cliente.
    expect(faixaDo(42, PREMISSAS["Indicador Que Não Existe"])).toBe("sem_premissa");
  });
});

describe("PREMISSAS — o que foi lido da página do cliente", () => {
  it("tem os vinte, e a ordem sai da mesma lista", () => {
    expect(Object.keys(PREMISSAS)).toHaveLength(20);
    expect(ORDEM_BSC).toEqual(Object.keys(PREMISSAS));
  });

  it("mínimo nunca passa da meta", () => {
    // Invertido, um indicador ficaria amarelo acima da meta e verde abaixo dela — e a tela pareceria
    // funcionar, porque as cores continuariam aparecendo.
    for (const [nome, p] of Object.entries(PREMISSAS)) {
      expect({ nome, ok: p.minimo <= p.target }).toEqual({ nome, ok: true });
    }
  });
});
