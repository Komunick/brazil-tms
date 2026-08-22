import { describe, expect, it } from "vitest";
import {
  impedimentoDaAtribuicao,
  normalizarPlaca,
  placasEsperadas,
  impedimentoParaAtribuir,
  rotaDaAtribuicao,
  placasDoPortal,
} from "./portal-assignment";

describe("placasEsperadas", () => {
  /**
   * Medido no portal em 85 viagens já atribuídas, sem exceção: CARRETA e CARRETA - EXPRESSA levam
   * duas placas; TRUCK, TOCO, 3/4 e VUC levam uma.
   */
  it("carreta e parentes levam duas; o resto leva uma", () => {
    for (const tipo of ["carreta", "carreta_ls", "bitrem", "rodotrem"] as const) {
      expect(placasEsperadas(tipo)).toBe(2);
    }
    for (const tipo of ["truck", "toco", "tres_quartos", "vuc", "van", "bitruck"] as const) {
      expect(placasEsperadas(tipo)).toBe(1);
    }
  });

  it("sem tipo, pede uma — o padrão errado que a tela deixa corrigir", () => {
    expect(placasEsperadas(null)).toBe(1);
    expect(placasEsperadas(undefined)).toBe(1);
  });
});

describe("rotaDaAtribuicao", () => {
  /**
   * NÃO é escolha de estilo. Medido: com um motorista o portal chama `/trip/assign`; com dois,
   * `/trip/accept/assign_multiple_driver`. Mandar dois pela rota de um faz o portal responder
   * SUCESSO e ignorar o segundo em silêncio.
   */
  it("um motorista vai por assign; dois vão pela rota do driver_pool", () => {
    expect(rotaDaAtribuicao({ secondDriverId: null })).toBe("assign");
    expect(rotaDaAtribuicao({ secondDriverId: undefined })).toBe("assign");
    expect(rotaDaAtribuicao({ secondDriverId: 3387103 })).toBe("multi");
  });
});

describe("normalizarPlaca", () => {
  it("maiúscula e sem separador, como o portal escreve", () => {
    expect(normalizarPlaca("thc-8g85")).toBe("THC8G85");
    expect(normalizarPlaca(" qtr 1006 ")).toBe("QTR1006");
  });
});

describe("impedimentoDaAtribuicao", () => {
  const ok = { driverId: 3751471, secondDriverId: null, plates: ["DTC6G50"] };

  it("motorista mais placa válida passa", () => {
    expect(impedimentoDaAtribuicao(ok)).toBeNull();
  });

  it("aceita os dois formatos de placa que convivem no Brasil", () => {
    expect(impedimentoDaAtribuicao({ ...ok, plates: ["ABC1234"] })).toBeNull();
    expect(impedimentoDaAtribuicao({ ...ok, plates: ["ABC1D23"] })).toBeNull();
  });

  it("recusa o que o portal recusaria — mas antes, com a pessoa ainda na tela", () => {
    expect(impedimentoDaAtribuicao({ ...ok, driverId: 0 })).toBe("sem_motorista");
    expect(impedimentoDaAtribuicao({ ...ok, plates: [] })).toBe("sem_placa");
    expect(impedimentoDaAtribuicao({ ...ok, plates: ["  "] })).toBe("sem_placa");
    expect(impedimentoDaAtribuicao({ ...ok, plates: ["ABC12"] })).toBe("placa_invalida");
  });

  /**
   * Duas placas iguais e dois motoristas iguais são erros de digitação que o portal pode até aceitar
   * — e aí a viagem sai com o mesmo cavalo duas vezes, ou com o mesmo motorista contado em dobro.
   */
  it("recusa repetição de placa e de motorista", () => {
    expect(impedimentoDaAtribuicao({ ...ok, plates: ["THC8G85", "THC8G85"] })).toBe(
      "placas_repetidas",
    );
    expect(impedimentoDaAtribuicao({ ...ok, secondDriverId: 3751471 })).toBe(
      "motoristas_repetidos",
    );
  });

  it("a carreta com as duas placas distintas passa", () => {
    expect(
      impedimentoDaAtribuicao({
        driverId: 2552050,
        secondDriverId: null,
        plates: ["THC8G85", "THF7H82"],
      }),
    ).toBeNull();
  });
});

describe("impedimentoParaAtribuir", () => {
  const base = { acceptanceStatus: "Accepted", portalTripId: "4007760", temOrdemAberta: false };

  /**
   * A REGRA QUE QUASE MATOU A ATRIBUIÇÃO INTEIRA.
   *
   * Aceitar exige `Pending`; atribuir exige `Accepted` — o mesmo campo, valores opostos. Aplicar o
   * guarda do aceite às três ações fazia toda atribuição ser recusada antes de o portal ser chamado.
   */
  it("viagem aceita pode receber atribuição", () => {
    expect(impedimentoParaAtribuir(base)).toBeNull();
  });

  it("viagem ainda pendente NÃO pode — é o oposto da regra do aceite", () => {
    expect(impedimentoParaAtribuir({ ...base, acceptanceStatus: "Pending" })).toBe("nao_aceita");
    expect(impedimentoParaAtribuir({ ...base, acceptanceStatus: null })).toBe("nao_aceita");
  });

  /**
   * Reatribuir é operação corriqueira — motorista passou mal, veículo quebrou —, e no portal
   * "Atribuir" e "Editar" são o mesmo botão. Nada aqui pode exigir que a viagem esteja sem motorista.
   */
  it("nada exige que a viagem esteja sem motorista: reatribuir é legítimo", () => {
    expect(impedimentoParaAtribuir(base)).toBeNull();
  });

  it("sem id do portal não há destinatário; ordem em voo bloqueia a segunda", () => {
    expect(impedimentoParaAtribuir({ ...base, portalTripId: null })).toBe("sem_id_do_portal");
    expect(impedimentoParaAtribuir({ ...base, temOrdemAberta: true })).toBe("ordem_em_andamento");
  });
});

describe("placasDoPortal", () => {
  it("separa as duas placas da carreta, que o portal manda numa string só", () => {
    expect(placasDoPortal("PXW0I78,EMU0J25")).toEqual(["PXW0I78", "EMU0J25"]);
  });

  it("aceita ponto e vírgula, que é o que sai de planilha", () => {
    expect(placasDoPortal("MTD9D19; QIT0728")).toEqual(["MTD9D19", "QIT0728"]);
  });

  it("devolve uma só quando o veículo leva uma", () => {
    expect(placasDoPortal("SEN2G44")).toEqual(["SEN2G44"]);
  });

  it("não inventa campo vazio a partir de vírgula sobrando", () => {
    expect(placasDoPortal("PXW0I78,")).toEqual(["PXW0I78"]);
  });

  it("sem campo nenhum, devolve lista vazia — a viagem ainda não foi escalada", () => {
    expect(placasDoPortal(null)).toEqual([]);
    expect(placasDoPortal("")).toEqual([]);
  });
});
