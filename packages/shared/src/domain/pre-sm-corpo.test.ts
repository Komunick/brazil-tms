import { describe, expect, it } from "vitest";
import {
  montarCorpoDoSetPreSM,
  motivosDeNaoEnviar,
  type DadosParaSetPreSM,
} from "./pre-sm-corpo";

/** Uma viagem completa, com os valores reais medidos em 25/08. */
const COMPLETO: DadosParaSetPreSM = {
  codFilial: 9332,
  codPerfilSeguranca: 20785,
  codRota: 3487228,
  codIbgeOrigem: 2930709,
  codIbgeDestino: 1721000,
  cpfMotorista: "019.326.535-46",
  vinculoMotorista: "agregado",
  placas: [
    { placa: "MDS6J45", vinculo: "agregado" },
    { placa: "CBS1E49", vinculo: "terceiro" },
  ],
  chegadaNaColeta: "2026-08-26T12:00:00Z",
  saidaDaColeta: "2026-08-26T14:00:00Z",
  chegadaNaEntrega: "2026-08-27T04:00:00Z",
  saidaDaEntrega: "2026-08-27T06:00:00Z",
};

describe("motivosDeNaoEnviar", () => {
  it("com tudo, não há motivo", () => {
    expect(motivosDeNaoEnviar(COMPLETO)).toEqual([]);
  });

  it("cada falta tem o seu motivo, porque cada uma se resolve num lugar", () => {
    expect(motivosDeNaoEnviar({ ...COMPLETO, codRota: null })).toEqual(["sem_rota"]);
    expect(motivosDeNaoEnviar({ ...COMPLETO, codIbgeOrigem: null })).toEqual(["sem_cidade_origem"]);
    expect(motivosDeNaoEnviar({ ...COMPLETO, cpfMotorista: null })).toEqual(["sem_cpf"]);
    expect(motivosDeNaoEnviar({ ...COMPLETO, placas: [] })).toEqual(["sem_placa"]);
    expect(motivosDeNaoEnviar({ ...COMPLETO, saidaDaColeta: null })).toEqual(["sem_janela_coleta"]);
    expect(motivosDeNaoEnviar({ ...COMPLETO, chegadaNaEntrega: null })).toEqual([
      "sem_janela_entrega",
    ]);
  });

  /**
   * O QUE MUDOU EM RELAÇÃO À 026, e por quê.
   *
   * Lá se devolvia UM motivo, o mais acionável. Aqui o consumidor é a fila da aba GR: a pessoa está
   * ali para resolver, e descobrir que falta o CPF, resolver, e só então descobrir que também falta
   * o vínculo é duas idas ao cadastro em vez de uma.
   */
  it("faltando três, mostra os TRÊS", () => {
    const m = motivosDeNaoEnviar({
      ...COMPLETO,
      codRota: null,
      cpfMotorista: null,
      vinculoMotorista: "subcontracted",
    });
    expect(m).toEqual(["sem_rota", "sem_cpf", "sem_vinculo_motorista"]);
  });

  /**
   * A ORDEM É PARTE DA RESPOSTA.
   *
   * Quem lê a fila age de cima para baixo. Rota e cidade **não se resolvem na viagem** — exigem
   * cadastro na gerenciadora ou conferência de uma correspondência. CPF e vínculo se resolvem no
   * nosso cadastro, em minutos.
   *
   * Pôr "falta CPF" antes faria alguém correr atrás do documento, resolver, e a linha continuar
   * travada.
   */
  it("o que não se resolve na viagem vem primeiro", () => {
    const m = motivosDeNaoEnviar({ ...COMPLETO, codRota: null, cpfMotorista: null });
    expect(m[0]).toBe("sem_rota");
  });

  /**
   * `subcontracted` significa "ainda não classificado" — 1.246 veículos e 405 motoristas estão
   * assim. Chutar `A` mandaria informação errada para quem faz escolta, e o erro seria invisível.
   */
  it("subcontracted vira motivo, nunca uma letra", () => {
    expect(motivosDeNaoEnviar({ ...COMPLETO, vinculoMotorista: "subcontracted" })).toEqual([
      "sem_vinculo_motorista",
    ]);
    expect(
      motivosDeNaoEnviar({
        ...COMPLETO,
        placas: [{ placa: "MDS6J45", vinculo: "subcontracted" }],
      }),
    ).toEqual(["sem_vinculo_veiculo"]);
  });

  it("o segundo motorista, quando existe, é cobrado igual ao primeiro", () => {
    expect(
      motivosDeNaoEnviar({
        ...COMPLETO,
        cpfSegundoMotorista: "01932653547",
        vinculoSegundoMotorista: "subcontracted",
      }),
    ).toEqual(["sem_vinculo_motorista"]);
  });

  it("CPF precisa ter 11 dígitos — meio CPF não é CPF", () => {
    expect(motivosDeNaoEnviar({ ...COMPLETO, cpfMotorista: "019326535" })).toEqual(["sem_cpf"]);
  });
});

describe("montarCorpoDoSetPreSM", () => {
  it("monta o corpo inteiro, com os valores da configuração", () => {
    const c = montarCorpoDoSetPreSM(COMPLETO)!;
    expect(c.PreSM.Codigo).toBe(0);
    expect(c.PreSM.Engate.CodFilial).toBe(9332);
    expect(c.PreSM.Engate.CodPerfilSeguranca).toBe(20785);
    expect(c.PreSM.Engate.PlacaVeiculo).toBe("MDS6J45");
    expect(c.PreSM.Engate.VincVeiculo).toBe("A");
    expect(c.PreSM.Engate.PlacaCarreta1).toBe("CBS1E49");
    expect(c.PreSM.Engate.VincCarreta1).toBe("T");
    expect(c.PreSM.Engate.CPFMotorista1).toBe("01932653546");
    expect(c.PreSM.Engate.VincMotorista1).toBe("A");
    expect(c.PreSM.Rota.CodRota).toBe(3487228);
  });

  /** `Codigo: 0` é incluir. Diferente de zero seria ALTERAR uma Pré-SM existente. */
  it("Codigo é sempre zero — isto inclui, nunca altera", () => {
    expect(montarCorpoDoSetPreSM(COMPLETO)!.PreSM.Codigo).toBe(0);
  });

  it("a coleta e a entrega viram dois registros, com o IBGE de cada ponta", () => {
    const ce = montarCorpoDoSetPreSM(COMPLETO)!.PreSM.Detalhamento.ColetasEntregas;
    expect(ce).toHaveLength(2);
    expect(ce[0]!.Tipo).toBe("COLETA");
    expect(ce[0]!.CodIBGECidade).toBe(2930709);
    expect(ce[1]!.Tipo).toBe("ENTREGA");
    expect(ce[1]!.CodIBGECidade).toBe(1721000);
  });

  /**
   * O ERRO QUE PASSA EM TESTE INGÊNUO E APARECE NA ESTRADA.
   *
   * A gerenciadora agenda escolta em hora LOCAL. Mandar UTC deslocaria toda coleta em três horas —
   * um caminhão marcado para as 9h teria escolta esperando às 12h.
   */
  it("as datas vão em horário de São Paulo, não UTC", () => {
    const ce = montarCorpoDoSetPreSM(COMPLETO)!.PreSM.Detalhamento.ColetasEntregas;
    // 12:00Z é 09:00 em São Paulo.
    expect(ce[0]!.DataHoraChegada).toBe("2026-08-26 09:00");
    expect(ce[0]!.DataHoraSaida).toBe("2026-08-26 11:00");
  });

  /** Meio corpo é pior que nenhum: o que fica em branco é o que a escolta usa. */
  it("faltando qualquer coisa, não monta nada", () => {
    expect(montarCorpoDoSetPreSM({ ...COMPLETO, codRota: null })).toBeNull();
    expect(montarCorpoDoSetPreSM({ ...COMPLETO, codIbgeDestino: null })).toBeNull();
    expect(montarCorpoDoSetPreSM({ ...COMPLETO, cpfMotorista: null })).toBeNull();
  });

  /**
   * A configuração é obrigatória e NÃO tem motivo próprio: se ela faltar, é defeito de instalação,
   * não trabalho de cadastro. A fila não deve pedir a uma pessoa que resolva isso.
   */
  it("sem filial ou perfil de segurança, não monta — e isso não é motivo de fila", () => {
    expect(montarCorpoDoSetPreSM({ ...COMPLETO, codFilial: null })).toBeNull();
    expect(motivosDeNaoEnviar({ ...COMPLETO, codFilial: null })).toEqual([]);
  });

  it("sem segundo motorista, os campos dele nem aparecem", () => {
    const e = montarCorpoDoSetPreSM(COMPLETO)!.PreSM.Engate;
    expect(e.CPFMotorista2).toBeUndefined();
    expect(e.VincMotorista2).toBeUndefined();
  });

  /**
   * A PRIMEIRA PLACA É O CAVALO; as demais são carretas, e a Integra aceita três.
   *
   * Com cinco placas: `AAA` é o veículo, e as carretas são `BBB`, `CCC` e `DDD`. A quinta é
   * descartada em vez de virar um campo que a API não conhece.
   */
  it("a primeira placa é o cavalo, e no máximo três carretas depois", () => {
    const e = montarCorpoDoSetPreSM({
      ...COMPLETO,
      placas: [
        { placa: "AAA1A11", vinculo: "owned" },
        { placa: "BBB2B22", vinculo: "owned" },
        { placa: "CCC3C33", vinculo: "owned" },
        { placa: "DDD4D44", vinculo: "owned" },
        { placa: "EEE5E55", vinculo: "owned" },
      ],
    })!.PreSM.Engate;
    expect(e.PlacaVeiculo).toBe("AAA1A11");
    expect(e.PlacaCarreta1).toBe("BBB2B22");
    expect(e.PlacaCarreta3).toBe("DDD4D44");
    expect(e.PlacaCarreta4).toBeUndefined();
  });
});
