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

  it("NÃO confirma atribuição em viagem que o portal diz estar pendente", () => {
    const v = confirmarAcaoNoPortal({
      acao: "assign",
      enviadas: ["NZZ7H06"],
      portal: portal({ acceptanceStatus: "Pending", plateLabel: "NZZ7H06" }),
    });
    expect(v.confirmado).toBe(false);
  });

  /**
   * MEDIDO EM PRODUÇÃO (29/08): o `/trip/detail` traz `vehicle_number` e NÃO traz
   * `acceptance_status`.
   *
   * A versão anterior exigia "Accepted" e reprovava a ausência — marcando como falha atribuições
   * que o portal já mostrava atribuídas. Foi a terceira vez em dois dias que o mesmo raciocínio
   * errado passou: exigir prova que a fonte não fornece e ler silêncio como desacordo.
   *
   * A placa é a prova. A aceitação só age quando o portal AFIRMA outra coisa.
   */
  it("confirma pela placa quando o portal não informa aceitação", () => {
    const v = confirmarAcaoNoPortal({
      acao: "assign",
      enviadas: ["NZZ7H06"],
      portal: portal({ acceptanceStatus: null, plateLabel: "NZZ7H06" }),
    });
    expect(v.confirmado).toBe(true);
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

/**
 * A REGRA QUE VALE PARA AS TRÊS AÇÕES, e que já falhou DUAS vezes em dois dias.
 *
 * 28/08 — a recusa devolvia `false` por não ter o que conferir. Teria gravado como falha toda
 *         recusa bem-sucedida.
 * 29/08 — a releitura do detalhe era lida com o parser da LISTAGEM, não achava nada, e o "não
 *         achei" virava `false`. Quatro atribuições foram marcadas como falha EM PRODUÇÃO
 *         enquanto o portal mostrava todas como `Assigned`.
 *
 * As duas têm a mesma forma: ignorância nossa virando acusação ao portal. Só uma contradição
 * POSITIVA — ele mostra outra coisa — pode reprovar.
 */
describe("só contradição positiva reprova", () => {
  it("placa ausente no portal não é o mesmo que placa diferente", () => {
    const outraPlaca = confirmarAcaoNoPortal({
      acao: "assign",
      enviadas: ["NZZ7H06"],
      portal: portal({ plateLabel: "MKK6B69" }),
    });
    const semPlaca = confirmarAcaoNoPortal({
      acao: "assign",
      enviadas: ["NZZ7H06"],
      portal: portal({ plateLabel: null }),
    });
    // A primeira é acusação — o portal mostra OUTRA coisa — e reprova.
    expect(outraPlaca.confirmado).toBe(false);
    // A segunda é só falta de dado, e nunca pode confirmar.
    expect(semPlaca.confirmado).not.toBe(true);
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
