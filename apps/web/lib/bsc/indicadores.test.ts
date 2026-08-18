import { describe, expect, it } from "vitest";
import { indicadoresNaTela, ORDEM_BSC } from "./indicadores";

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

  it("põe na frente os seis com piso publicado — é onde o contrato dói", () => {
    expect(indicadoresNaTela(VINTE).slice(0, 6)).toEqual([
      "SPOT",
      "ETA Origem",
      "ETA Destino",
      "Telemetria",
      "No Show",
      "Reversa",
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
    const nomes = indicadoresNaTela({ SPOT: 90.91, Telemetria: 26.83 });
    expect(nomes).toEqual(["SPOT", "Telemetria"]);
  });

  it("a ordem não tem nome repetido", () => {
    // Um nome duplicado viraria dois cartões iguais na TV, e a chave repetida no React some sem erro.
    expect(new Set(ORDEM_BSC).size).toBe(ORDEM_BSC.length);
  });
});
