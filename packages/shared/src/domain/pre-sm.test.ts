import { describe, expect, it } from "vitest";
import {
  donoEhPessoaFisica,
  montarCorpoDaPreSM,
  motivoDeNaoCriar,
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

describe("motivoDeNaoCriar", () => {
  const COMPLETO = {
    codModelo: 23343,
    cpfMotorista: "01932653546",
    vinculoMotorista: "agregado" as const,
    placas: [{ placa: "ATG9I07", vinculo: "agregado" as const }],
    chegadaNaColeta: "2026-08-26T09:00:00Z",
    saidaDaColeta: "2026-08-26T11:00:00Z",
  };

  it("com tudo, não há motivo — a Pré-SM pode ser criada", () => {
    expect(motivoDeNaoCriar(COMPLETO)).toBeNull();
  });

  it("cada falta tem o seu motivo, porque cada uma se resolve em outro lugar", () => {
    expect(motivoDeNaoCriar({ ...COMPLETO, codModelo: null })).toBe("sem_modelo");
    expect(motivoDeNaoCriar({ ...COMPLETO, cpfMotorista: null })).toBe("sem_cpf");
    expect(motivoDeNaoCriar({ ...COMPLETO, placas: [] })).toBe("sem_placa");
    expect(motivoDeNaoCriar({ ...COMPLETO, vinculoMotorista: "subcontracted" })).toBe(
      "sem_vinculo_motorista",
    );
    expect(
      motivoDeNaoCriar({ ...COMPLETO, placas: [{ placa: "ATG9I07", vinculo: "subcontracted" }] }),
    ).toBe("sem_vinculo_veiculo");
    expect(motivoDeNaoCriar({ ...COMPLETO, saidaDaColeta: null })).toBe("sem_janela_coleta");
  });

  /**
   * O CASO QUE JUSTIFICA A ORDEM DOS TESTES.
   *
   * Faltando modelo E CPF, a pessoa vê UM motivo. Tem de ser o modelo: ele é o único que não se
   * resolve na viagem — exige cadastro na gerenciadora ou conferência de uma correspondência.
   * Mostrar "sem CPF" faria alguém correr atrás do documento, resolver, e a Pré-SM continuar não
   * saindo. Trabalho à toa, e a confiança na tela vai junto.
   */
  it("quando faltam dois, mostra o que NÃO se resolve na viagem", () => {
    expect(motivoDeNaoCriar({ ...COMPLETO, codModelo: null, cpfMotorista: null })).toBe(
      "sem_modelo",
    );
  });

  it("CPF precisa ter 11 dígitos — meio CPF não é CPF", () => {
    expect(motivoDeNaoCriar({ ...COMPLETO, cpfMotorista: "019326535" })).toBe("sem_cpf");
    expect(motivoDeNaoCriar({ ...COMPLETO, cpfMotorista: "019.326.535-46" })).toBeNull();
  });

  it("o segundo motorista, quando existe, é cobrado igual ao primeiro", () => {
    expect(
      motivoDeNaoCriar({
        ...COMPLETO,
        cpfSegundoMotorista: "01932653547",
        vinculoSegundoMotorista: "subcontracted",
      }),
    ).toBe("sem_vinculo_motorista");
  });
});

describe("montarCorpoDaPreSM", () => {
  const COMPLETO = {
    codModelo: 23343,
    cpfMotorista: "019.326.535-46",
    vinculoMotorista: "agregado" as const,
    placas: [
      { placa: "MDS6J45", vinculo: "agregado" as const },
      { placa: "CBS1E49", vinculo: "terceiro" as const },
    ],
    chegadaNaColeta: "2026-08-26T12:00:00Z",
    saidaDaColeta: "2026-08-26T14:00:00Z",
  };

  it("monta o corpo com cavalo, carreta e as letras da gerenciadora", () => {
    const c = montarCorpoDaPreSM(COMPLETO)!;
    expect(c.CodModelo).toBe(23343);
    expect(c.PlacaVeiculo).toBe("MDS6J45");
    expect(c.VincVeiculo).toBe("A");
    expect(c.PlacaCarreta1).toBe("CBS1E49");
    expect(c.VincCarreta1).toBe("T");
    expect(c.CPFMotorista1).toBe("01932653546");
    expect(c.VincMotorista1).toBe("A");
  });

  it("não monta nada quando falta algo — meio corpo é pior que nenhum", () => {
    expect(montarCorpoDaPreSM({ ...COMPLETO, codModelo: null })).toBeNull();
  });

  it("sem segundo motorista, os campos dele nem aparecem", () => {
    const c = montarCorpoDaPreSM(COMPLETO)!;
    expect(c.CPFMotorista2).toBeUndefined();
    expect(c.VincMotorista2).toBeUndefined();
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
