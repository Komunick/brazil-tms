import { describe, expect, it } from "vitest";
import {
  casarModelo,
  normalizarEstacao,
  proporCorrespondencias,
  tokensDaEstacao,
  type ModeloDaGerenciadora,
} from "./pre-sm-modelos";

/** Modelos reais, tirados do `getModelosPreSM` em 2026-08-25. */
const MODELOS: ModeloDaGerenciadora[] = [
  { codigo: 23343, descricao: "JABOATÃO X RECIFE OLINDA" },
  { codigo: 21639, descricao: "GOIANIA (AEROPORTO) X PALMAS" },
  { codigo: 22451, descricao: "ARACAJU 2 X SIMOES" },
  { codigo: 22772, descricao: "LOUVEIRA X CAMPINAS" },
  { codigo: 23036, descricao: "CAMPO MOURÃO X CURITIBA" },
  { codigo: 22711, descricao: "JABOATÃO X MURIBECA" },
];

describe("normalizarEstacao — as quatro tolerâncias", () => {
  /**
   * Cada uma destas saiu de um casamento que FALHOU no levantamento de 25/08. Nenhuma é hipótese.
   */
  it("acento: JABOATÃO e JABOATAO são a mesma estação", () => {
    expect(normalizarEstacao("JABOATÃO")).toBe(normalizarEstacao("JABOATAO"));
  });

  it("parênteses: o que está dentro não distingue nada", () => {
    expect(normalizarEstacao("GOIANIA (AEROPORTO)")).toBe("GOIANIA");
    expect(normalizarEstacao("SOC_RJ_RIO DE JANEIRO (S. J. MERITI)")).toContain("RIO DE JANEIRO");
  });

  it("sigla colada a número: o portal cola, o modelo separa", () => {
    expect(normalizarEstacao("ARACAJU02")).toBe(normalizarEstacao("ARACAJU 02"));
  });

  /**
   * A tolerância mais cara. Sem ela, 4 rotas e 233 viagens/mês caíam como "sem modelo" — e eu só
   * descobri porque estranhei ver `ARACAJU 2 X SIMOES` na lista de modelos e a rota correspondente
   * na lista de "sem modelo".
   */
  it("zero à esquerda: 02 e 2 são o mesmo número de estação", () => {
    expect(normalizarEstacao("ARACAJU 02")).toBe(normalizarEstacao("ARACAJU 2"));
    expect(normalizarEstacao("ARACAJU02")).toBe("ARACAJU 2");
  });
});

describe("tokensDaEstacao", () => {
  /**
   * O ERRO QUE ME FEZ CONTAR 26 DE 138.
   *
   * Eu cortava o nome no primeiro termo depois da UF, então `LM HUB_PE_RECIFE_OLINDA` virava
   * `RECIFE` e não achava `JABOATÃO X RECIFE OLINDA`, que existia. O nome é tudo o que vem depois
   * da UF.
   */
  it("pega o nome INTEIRO depois da UF, não só o primeiro termo", () => {
    expect([...tokensDaEstacao("LM HUB_PE_RECIFE_OLINDA")].sort()).toEqual(["OLINDA", "RECIFE"]);
  });

  it("descarta prefixo e UF, que são nossos e o modelo não usa", () => {
    expect(tokensDaEstacao("SOC_PE_JABOATÃO DOS GUARARAPES").has("SOC")).toBe(false);
    expect(tokensDaEstacao("SOC_PE_JABOATÃO DOS GUARARAPES").has("PE")).toBe(false);
  });

  it("SIMOES FILHO no nosso cadastro é SIMOES no modelo dela", () => {
    expect(tokensDaEstacao("SOC_BA_SIMOES FILHO").has("FILHO")).toBe(false);
  });
});

describe("casarModelo", () => {
  it("casa a rota que o levantamento provou existir", () => {
    expect(
      casarModelo("SOC_PE_JABOATÃO DOS GUARARAPES", "LM HUB_PE_RECIFE_OLINDA", MODELOS)?.codigo,
    ).toBe(23343);
  });

  it("casa apesar do zero à esquerda — as 233 viagens/mês", () => {
    expect(casarModelo("FM HUB_SE_ARACAJU02", "SOC_BA_SIMOES FILHO", MODELOS)?.codigo).toBe(22451);
  });

  it("casa quando o modelo é mais curto que a estação", () => {
    expect(
      casarModelo("SOC_GO_GOIANIA_02 (AEROPORTO)", "LM HUB_TO_PALMAS", MODELOS)?.codigo,
    ).toBe(21639);
  });

  /**
   * O caso que o casamento por um token só estragaria: Recife tem várias estações, e mandar a
   * viagem de Muribeca pelo modelo de Olinda seria escolta contratada para outro trajeto.
   */
  it("NÃO confunde duas estações da mesma cidade", () => {
    expect(
      casarModelo("SOC_PE_JABOATÃO DOS GUARARAPES", "LM HUB_PE_RECIFE_MURIBECA", MODELOS)?.codigo,
    ).toBe(22711);
  });

  it("devolve null quando não há modelo — é o que vira 'sem modelo' na viagem", () => {
    expect(casarModelo("SOC_SP_GUARULHOS", "LM Hub_SP_Mooca_02", MODELOS)).toBeNull();
  });

  it("devolve null sem origem ou sem destino", () => {
    expect(casarModelo(null, "LM HUB_TO_PALMAS", MODELOS)).toBeNull();
    expect(casarModelo("SOC_GO_GOIANIA_02", null, MODELOS)).toBeNull();
  });
});

describe("proporCorrespondencias", () => {
  it("propõe só o que casou, sem repetir a mesma rota", () => {
    const r = proporCorrespondencias(
      [
        { origem: "SOC_PE_JABOATÃO DOS GUARARAPES", destino: "LM HUB_PE_RECIFE_OLINDA" },
        { origem: "SOC_PE_JABOATAO DOS GUARARAPES", destino: "LM Hub_PE_Recife_Olinda" },
        { origem: "SOC_SP_GUARULHOS", destino: "LM Hub_SP_Mooca_02" },
      ],
      MODELOS,
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.codModelo).toBe(23343);
  });

  it("normaliza a chave, então a mesma rota escrita de dois jeitos vira uma linha só", () => {
    const r = proporCorrespondencias(
      [
        { origem: "FM HUB_SE_ARACAJU02", destino: "SOC_BA_SIMOES FILHO" },
        { origem: "LM HUB_SE_ARACAJU_02", destino: "SOC_BA_SIMOES FILHO" },
      ],
      MODELOS,
    );
    expect(r).toHaveLength(1);
  });
});
