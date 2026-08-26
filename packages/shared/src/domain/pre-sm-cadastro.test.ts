import { describe, expect, it } from "vitest";
import {
  acharCidade,
  chaveDaEstacao,
  proporRotas,
  type CidadeDelas,
  type RotaDelas,
} from "./pre-sm-cadastro";

/** Cidades reais do `getCidades`, medidas em 2026-08-25. */
const CIDADES: CidadeDelas[] = [
  { codIbge: 3106705, cidade: "BETIM", uf: "MG" },
  { codIbge: 2930709, cidade: "SIMOES FILHO", uf: "BA" },
  { codIbge: 2611606, cidade: "RECIFE", uf: "PE" },
  { codIbge: 3509502, cidade: "CAMPINAS", uf: "SP" },
  { codIbge: 4128104, cidade: "UMUARAMA", uf: "PR" },
  { codIbge: 1721000, cidade: "PALMAS", uf: "TO" },
  { codIbge: 2607901, cidade: "JABOATAO DOS GUARARAPES", uf: "PE" },
  { codIbge: 3550308, cidade: "SAO PAULO", uf: "SP" },
];

describe("acharCidade", () => {
  it("acha a cidade pelo nome da estação", () => {
    expect(acharCidade("SOC_MG_BETIM", CIDADES)?.codIbge).toBe(3106705);
    expect(acharCidade("LM HUB_TO_PALMAS", CIDADES)?.codIbge).toBe(1721000);
  });

  it("acento e pontuação não atrapalham", () => {
    expect(acharCidade("SOC_PE_JABOATÃO DOS GUARARAPES", CIDADES)?.codIbge).toBe(2607901);
  });

  /**
   * A TOLERÂNCIA DO SUFIXO. Medido em 25/08: sem ela, 25 estações não resolviam.
   */
  it("descarta bairro e distrito do fim do nome", () => {
    expect(acharCidade("LM HUB_PE_RECIFE_MURIBECA", CIDADES)?.codIbge).toBe(2611606);
    expect(acharCidade("FM Hub_SP_CAMPINAS_PQ_CIDADE", CIDADES)?.codIbge).toBe(3509502);
    expect(acharCidade("FM HUB_PR_UMUARAMA_PQ_INDUST_II", CIDADES)?.codIbge).toBe(4128104);
  });

  /**
   * O CASO QUE DERRUBOU A PRIMEIRA VERSÃO DESTA FUNÇÃO.
   *
   * Ela caía para o **primeiro termo** quando o nome inteiro não achava. Isso quebra toda cidade de
   * nome composto com sufixo: `SAO LUIS 1` virava `SAO`, `BELO HORIZONTE 2` virava `BELO`.
   *
   * Medido contra a produção: custava **8 rotas e 5 pontos** de cobertura (49 → 57 rotas).
   * Descartar do fim, um termo por vez, resolve os dois casos.
   */
  it("cidade de nome composto com sufixo numérico resolve", () => {
    const cidades = [
      ...CIDADES,
      { codIbge: 2111300, cidade: "SAO LUIS", uf: "MA" },
      { codIbge: 3106200, cidade: "BELO HORIZONTE", uf: "MG" },
      { codIbge: 2507507, cidade: "JOAO PESSOA", uf: "PB" },
    ];
    expect(acharCidade("LM HUB_MA_SAO LUIS_01", cidades)?.codIbge).toBe(2111300);
    expect(acharCidade("LM HUB_MG_BELO HORIZONTE_02", cidades)?.codIbge).toBe(3106200);
    expect(acharCidade("LM HUB_PB_JOÃO PESSOA_03", cidades)?.codIbge).toBe(2507507);
  });

  /**
   * O CASO QUE A TOLERÂNCIA NÃO PODE QUEBRAR.
   *
   * `SIMOES FILHO` existe como cidade. Se o encurtamento viesse ANTES de tentar o nome inteiro, ela
   * viraria `SIMOES` — que é outro lugar. A ordem é a regra inteira.
   */
  it("o nome inteiro ganha do encurtado quando os dois existem", () => {
    const cidades = [...CIDADES, { codIbge: 9999999, cidade: "SIMOES", uf: "BA" }];
    expect(acharCidade("SOC_BA_SIMOES FILHO", cidades)?.codIbge).toBe(2930709);
  });

  /** "Não sei" em vez de palpite: sem UF no nome não há como saber de que estado é a cidade. */
  it("sem UF no nome, não propõe nada", () => {
    expect(acharCidade("CD São Paulo", CIDADES)).toBeNull();
    expect(acharCidade("", CIDADES)).toBeNull();
    expect(acharCidade(null, CIDADES)).toBeNull();
  });

  it("cidade que ela não tem no cadastro não vira proposta", () => {
    expect(acharCidade("SOC_AC_RIO BRANCO", CIDADES)).toBeNull();
  });

  /** A descrição é o que a pessoa compara na tela — sem ela, confirmar seria aprovar um número. */
  it("guarda como ELA escreve, para a conferência", () => {
    expect(acharCidade("SOC_MG_BETIM", CIDADES)?.descricao).toBe("BETIM / MG");
  });
});

describe("proporRotas", () => {
  const ROTAS: RotaDelas[] = [
    {
      codigo: 3487228,
      descricao: "SIMOES FILHO/BA ATE PALMAS/TO",
      codIbgeOrigem: 2930709,
      codIbgeDestino: 1721000,
    },
    {
      codigo: 3487229,
      descricao: "BETIM/MG ATE CAMPINAS/SP",
      codIbgeOrigem: 3106705,
      codIbgeDestino: 3509502,
    },
  ];
  const IBGE = new Map([
    ["BA SIMOES FILHO", 2930709],
    ["TO PALMAS", 1721000],
    ["MG BETIM", 3106705],
    ["SP CAMPINAS", 3509502],
    ["PE RECIFE", 2611606],
  ]);

  it("casa pelo par de códigos IBGE", () => {
    const p = proporRotas(
      [{ origem: "SOC_BA_SIMOES FILHO", destino: "LM HUB_TO_PALMAS" }],
      IBGE,
      ROTAS,
    );
    expect(p).toHaveLength(1);
    expect(p[0]!.codRota).toBe(3487228);
  });

  /**
   * O SENTIDO IMPORTA. `A → B` e `B → A` são rotas diferentes na gerenciadora — trajeto, paradas e
   * apólice não são simétricos. Casar sem olhar o sentido poria escolta na direção errada.
   */
  it("a rota invertida NÃO casa", () => {
    expect(
      proporRotas([{ origem: "LM HUB_TO_PALMAS", destino: "SOC_BA_SIMOES FILHO" }], IBGE, ROTAS),
    ).toEqual([]);
  });

  /** Sem uma das cidades não há par. Chutar seria pior do que deixar de fora. */
  it("rota com só uma cidade resolvida fica de fora", () => {
    expect(
      proporRotas([{ origem: "SOC_BA_SIMOES FILHO", destino: "SOC_AC_RIO BRANCO" }], IBGE, ROTAS),
    ).toEqual([]);
  });

  /**
   * As 81 rotas que não existem no cadastro dela (medido: 134 nossas, 53 casadas). Não é erro —
   * é trabalho de cadastro DELA, e sair em silêncio é o certo: a fila da aba é que vai dizer.
   */
  it("par de cidades sem rota cadastrada não vira proposta", () => {
    expect(
      proporRotas([{ origem: "SOC_BA_SIMOES FILHO", destino: "LM HUB_PE_RECIFE" }], IBGE, ROTAS),
    ).toEqual([]);
  });

  it("a mesma rota aparecendo duas vezes só propõe uma", () => {
    const duas = [
      { origem: "SOC_MG_BETIM", destino: "FM Hub_SP_CAMPINAS" },
      { origem: "SOC_MG_BETIM", destino: "FM Hub_SP_CAMPINAS" },
    ];
    expect(proporRotas(duas, IBGE, ROTAS)).toHaveLength(1);
  });
});

/**
 * A chave precisa ser a MESMA na carga e na busca. Se divergirem, a carga grava com uma e a busca
 * procura por outra — e nenhuma rota casa, sem erro nenhum aparecer.
 */
describe("chaveDaEstacao", () => {
  it("é UF mais cidade, normalizadas", () => {
    expect(chaveDaEstacao("SOC_MG_BETIM")).toBe("MG BETIM");
    expect(chaveDaEstacao("SOC_PE_JABOATÃO DOS GUARARAPES")).toBe("PE JABOATAO DOS GUARARAPES");
  });

  it("estação fora do padrão devolve vazio, não um palpite", () => {
    expect(chaveDaEstacao("CD São Paulo")).toBe("");
  });
});
