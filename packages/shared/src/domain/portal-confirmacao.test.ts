import { describe, expect, it } from "vitest";
import { confirmarAcaoNoPortal, type ViagemNoPortal } from "./portal-confirmacao";

const portal = (over: Partial<ViagemNoPortal> = {}): ViagemNoPortal => ({
  acceptanceStatus: "Accepted",
  status: "Assigning",
  plateLabel: null,
  driverLabel: null,
  ...over,
});

describe("aceite", () => {
  it("confirma quando o portal mostra a viagem aceita", () => {
    const v = confirmarAcaoNoPortal({ acao: "accept", enviadas: [], portal: portal() });
    expect(v.confirmado).toBe(true);
  });

  /** O caso que motivou tudo: o portal respondeu `retcode 0` e não mudou nada. */
  it("NÃO confirma quando a aceitação continua pendente", () => {
    const v = confirmarAcaoNoPortal({
      acao: "accept",
      enviadas: [],
      portal: portal({ acceptanceStatus: "Pending" }),
    });
    expect(v.confirmado).toBe(false);
    expect(v).toHaveProperty("motivo", expect.stringContaining("Pending"));
  });

  it("NÃO confirma quando o portal não diz nada sobre aceitação", () => {
    const v = confirmarAcaoNoPortal({
      acao: "accept",
      enviadas: [],
      portal: portal({ acceptanceStatus: null }),
    });
    expect(v.confirmado).toBe(false);
  });
});

describe("atribuição", () => {
  it("confirma quando a placa enviada aparece no portal", () => {
    const v = confirmarAcaoNoPortal({
      acao: "assign",
      enviadas: ["NZZ7H06"],
      portal: portal({ plateLabel: "NZZ7H06", driverLabel: "MARCOS SILVA" }),
    });
    expect(v.confirmado).toBe(true);
    if (v.confirmado) expect(v.placasConferidas).toBe(1);
  });

  it("ignora pontuação e caixa da placa", () => {
    const v = confirmarAcaoNoPortal({
      acao: "assign",
      enviadas: ["nzz-7h06"],
      portal: portal({ plateLabel: "NZZ7H06" }),
    });
    expect(v.confirmado).toBe(true);
  });

  /**
   * O caso medido em 19/08: o cliente troca o caminhão depois do nosso espelho. Status certo,
   * placa de outra atribuição — e confirmar isso seria pior do que não confirmar.
   */
  it("NÃO confirma quando o portal mostra outra placa", () => {
    const v = confirmarAcaoNoPortal({
      acao: "assign",
      enviadas: ["ATM8A55"],
      portal: portal({ plateLabel: "MKK6B69" }),
    });
    expect(v.confirmado).toBe(false);
    expect(v).toHaveProperty("motivo", expect.stringContaining("MKK6B69"));
  });

  it("NÃO confirma quando o portal não mostra placa nenhuma", () => {
    const v = confirmarAcaoNoPortal({
      acao: "assign",
      enviadas: ["NZZ7H06"],
      portal: portal({ plateLabel: null }),
    });
    expect(v.confirmado).toBe(false);
  });

  it("NÃO confirma atribuição em viagem que não consta aceita", () => {
    const v = confirmarAcaoNoPortal({
      acao: "assign",
      enviadas: ["NZZ7H06"],
      portal: portal({ acceptanceStatus: "Pending", plateLabel: "NZZ7H06" }),
    });
    expect(v.confirmado).toBe(false);
  });

  /** Cavalo e carreta: o portal às vezes devolve as duas no mesmo campo. */
  it("conta as duas placas quando o portal devolve ambas", () => {
    const v = confirmarAcaoNoPortal({
      acao: "assign",
      enviadas: ["NZZ7H06", "OLD2A88"],
      portal: portal({ plateLabel: "NZZ7H06 / OLD2A88" }),
    });
    expect(v.confirmado).toBe(true);
    if (v.confirmado) expect(v.placasConferidas).toBe(2);
  });

  /** E quando ele devolve só a primeira, confirma — dizendo que conferiu uma só. */
  it("confirma com a primeira placa e declara quantas conferiu", () => {
    const v = confirmarAcaoNoPortal({
      acao: "assign",
      enviadas: ["NZZ7H06", "OLD2A88"],
      portal: portal({ plateLabel: "NZZ7H06" }),
    });
    expect(v.confirmado).toBe(true);
    if (v.confirmado) expect(v.placasConferidas).toBe(1);
  });
});

describe("recusa", () => {
  /**
   * O DEFEITO QUE ESTE TESTE EXISTE PARA IMPEDIR (achado na revisão de 28/08, antes de ir ao ar).
   *
   * A primeira versão devolvia `false` aqui. Como o robô manda a releitura para TODA ação
   * bem-sucedida, e quem encerra a ordem reprova em `false`, toda recusa que deu certo teria sido
   * gravada como FALHA — silenciosamente, e só na produção, depois de o userscript ser publicado.
   *
   * `null` é "não há como conferir". `false` é "o portal desmentiu". Num caminho que decide gasto,
   * essas duas respostas não podem ser a mesma.
   */
  it("devolve null — ausência de prova NÃO é prova de ausência", () => {
    const v = confirmarAcaoNoPortal({ acao: "reject", enviadas: [], portal: portal() });
    expect(v.confirmado).toBeNull();
    expect(v.confirmado).not.toBe(false);
  });
});
