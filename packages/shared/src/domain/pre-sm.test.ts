import { describe, expect, it } from "vitest";
import {
  divergenciasDaPreSm,
  donoEhPessoaFisica,
  paraDataHoraDaIntegra,
  vinculoParaLogae,
  vinculoSugerido,
} from "./pre-sm";

describe("vinculoParaLogae", () => {
  it("traduz os três vínculos escolhíveis", () => {
    expect(vinculoParaLogae("owned")).toBe("F");
    expect(vinculoParaLogae("agregado")).toBe("A");
    expect(vinculoParaLogae("terceiro")).toBe("T");
  });

  /**
   * O caso que justifica o arquivo.
   *
   * `subcontracted` significa "ainda não classificado", e 1.246 veículos estão assim. Chutar `A`
   * mandaria informação errada para quem faz escolta, e o erro seria invisível: a Pré-SM sairia, o
   * veículo rodaria, e ninguém saberia que a classificação era palpite nosso.
   */
  it("NÃO chuta para quem ainda não foi classificado", () => {
    expect(vinculoParaLogae("subcontracted")).toBeNull();
    expect(vinculoParaLogae(null)).toBeNull();
    expect(vinculoParaLogae(undefined)).toBeNull();
  });
});

describe("vinculoSugerido", () => {
  // O CNPJ da própria empresa, medido em 3 dos 40 veículos consultados.
  const NOSSO = "03571231000143";

  it("o CNPJ da própria empresa é frota própria", () => {
    expect(vinculoSugerido(NOSSO, NOSSO)).toBe("owned");
  });

  /**
   * Filial tem a mesma raiz e ordem diferente — um caminhão da filial continua sendo nosso.
   * Comparar os 14 dígitos inteiros classificaria a filial como "de fora".
   */
  it("compara pela raiz: filial também é nossa", () => {
    expect(vinculoSugerido("03571231000224", NOSSO)).toBe("owned");
  });

  it("CNPJ de outra empresa não recebe sugestão — agregado ou terceiro é decisão de gente", () => {
    expect(vinculoSugerido("53044902000196", NOSSO)).toBeNull();
  });

  it("pessoa física não recebe sugestão, mas nunca é frota própria", () => {
    expect(vinculoSugerido("00001932653546", NOSSO)).toBeNull();
    expect(donoEhPessoaFisica("00001932653546")).toBe(true);
  });

  it("sem dono, sem sugestão", () => {
    expect(vinculoSugerido(null, NOSSO)).toBeNull();
    expect(vinculoSugerido("", NOSSO)).toBeNull();
  });

  /**
   * Sem o CNPJ da empresa configurado, nada é "nosso" — e é o certo: sugerir frota própria sem
   * saber qual é a empresa classificaria o caminhão de um terceiro como nosso.
   */
  it("sem o CNPJ da empresa, ninguém é frota própria", () => {
    expect(vinculoSugerido(NOSSO, null)).toBeNull();
    expect(vinculoSugerido(NOSSO, "")).toBeNull();
  });

  it("aceita o CNPJ com pontuação, que é como ele costuma ser digitado", () => {
    expect(vinculoSugerido("03.571.231/0001-43", NOSSO)).toBe("owned");
  });
});

describe("donoEhPessoaFisica", () => {
  it("14 dígitos começando em zeros é CPF preenchido", () => {
    expect(donoEhPessoaFisica("00001932653546")).toBe(true);
    expect(donoEhPessoaFisica("00004179449501")).toBe(true);
  });

  it("CNPJ de empresa não é", () => {
    expect(donoEhPessoaFisica("53044902000196")).toBe(false);
    expect(donoEhPessoaFisica("03571231000143")).toBe(false);
  });

  it("vazio não é", () => {
    expect(donoEhPessoaFisica(null)).toBe(false);
    expect(donoEhPessoaFisica("")).toBe(false);
  });
});

describe("paraDataHoraDaIntegra", () => {
  /**
   * O formato do exemplo da própria Integra 14.2: `"2015-07-17 16:00"`. Sem `T`, sem segundos.
   */
  it("usa o formato da documentação dela", () => {
    expect(paraDataHoraDaIntegra("2026-08-26T12:00:00Z")).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
  });

  /**
   * O ERRO QUE PASSARIA NO TESTE E APARECERIA NA ESTRADA.
   *
   * A gerenciadora agenda escolta em hora LOCAL. Mandar UTC deslocaria toda coleta em três horas —
   * um caminhão marcado para as 9h chegaria com a escolta esperando às 12h.
   */
  it("converte para o horário de São Paulo, não UTC", () => {
    // 12:00 UTC é 09:00 em São Paulo.
    expect(paraDataHoraDaIntegra("2026-08-26T12:00:00Z")).toBe("2026-08-26 09:00");
  });

  it("data inválida vira string vazia em vez de 'Invalid Date'", () => {
    expect(paraDataHoraDaIntegra("nao e data")).toBe("");
  });
});

describe("divergenciasDaPreSm", () => {
  const ENVIADO = {
    CPFMotorista1: "01932653546",
    PlacaVeiculo: "MDS6J45",
    PlacaCarreta1: "CBS1E49",
  };

  it("sem mudança, não avisa nada", () => {
    expect(
      divergenciasDaPreSm(ENVIADO, {
        cpfMotorista: "019.326.535-46",
        placas: ["MDS6J45", "CBS1E49"],
      }),
    ).toEqual([]);
  });

  it("motorista trocado é avisado", () => {
    expect(
      divergenciasDaPreSm(ENVIADO, { cpfMotorista: "01932653547", placas: ["MDS6J45", "CBS1E49"] }),
    ).toEqual(["motorista"]);
  });

  it("placa trocada é avisada", () => {
    expect(
      divergenciasDaPreSm(ENVIADO, { cpfMotorista: "01932653546", placas: ["ATG9I07"] }),
    ).toEqual(["placas"]);
  });

  /**
   * Cavalo e carreta trocados de CAMPO não mudam quem está na estrada. Acusar isso seria um aviso
   * sobre nada — e um aviso sobre nada ensina a ignorar todos.
   */
  it("a ordem das placas não é divergência", () => {
    expect(
      divergenciasDaPreSm(ENVIADO, {
        cpfMotorista: "01932653546",
        placas: ["CBS1E49", "MDS6J45"],
      }),
    ).toEqual([]);
  });

  /**
   * "Não sei" não é "mudou". Sem o dado de agora, acusar divergência produziria um aviso em toda
   * viagem cujo cadastro está incompleto — que é justamente onde ninguém pode fazer nada a respeito.
   */
  it("dado ausente de um dos lados não vira aviso", () => {
    expect(divergenciasDaPreSm(ENVIADO, { cpfMotorista: null, placas: [] })).toEqual([]);
    expect(divergenciasDaPreSm(null, { cpfMotorista: "01932653547" })).toEqual([]);
  });

  it("acusa os dois quando os dois mudaram", () => {
    expect(
      divergenciasDaPreSm(ENVIADO, { cpfMotorista: "01932653547", placas: ["ATG9I07"] }),
    ).toEqual(["motorista", "placas"]);
  });
});
