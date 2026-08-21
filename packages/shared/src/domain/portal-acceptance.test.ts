import { describe, expect, it } from "vitest";
import {
  MOTIVOS_DE_RECUSA,
  impedimentoDaAcao,
  motivoValido,
  podeAgir,
  rotuloDoMotivo,
} from "./portal-acceptance";

const base = {
  acceptanceStatus: "Pending" as string | null,
  portalTripId: "4018638" as string | null,
  temOrdemAberta: false,
};

describe("impedimentoDaAcao", () => {
  it("viagem esperando decisão, com id do portal e sem ordem em voo pode ser decidida", () => {
    expect(impedimentoDaAcao(base)).toBeNull();
    expect(podeAgir(base)).toBe(true);
  });

  it("viagem já aceita não é decidida de novo", () => {
    expect(impedimentoDaAcao({ ...base, acceptanceStatus: "Accepted" })).toBe("nao_esta_pendente");
  });

  /**
   * Viagem que nasceu de planilha não existe do lado do portal — não há a quem mandar. A tela diz
   * isso em vez de oferecer um botão que só falharia no fim da fila, depois de o robô já ter tentado.
   */
  it("viagem sem id do portal não tem destinatário", () => {
    expect(impedimentoDaAcao({ ...base, portalTripId: null })).toBe("sem_id_do_portal");
    expect(impedimentoDaAcao({ ...base, portalTripId: "  " })).toBe("sem_id_do_portal");
  });

  /**
   * A trava dos dois cliques. "Aceitar duas vezes" é o erro que não se desfaz do nosso lado, e a
   * defesa mora em três lugares: aqui, no índice parcial do banco, e no botão desabilitado.
   */
  it("ordem em voo bloqueia uma segunda", () => {
    expect(impedimentoDaAcao({ ...base, temOrdemAberta: true })).toBe("ordem_em_andamento");
  });

  it("a ordem dos impedimentos é a do mais fundamental primeiro", () => {
    // Sem id E já aceita: o que se diz é que ela não está pendente, que é a informação que resolve.
    expect(
      impedimentoDaAcao({ acceptanceStatus: "Accepted", portalTripId: null, temOrdemAberta: true }),
    ).toBe("nao_esta_pendente");
  });
});

describe("motivos de recusa", () => {
  it("são os três que o portal serve hoje", () => {
    expect(MOTIVOS_DE_RECUSA.map((m) => m.id)).toEqual([4, 5, 6]);
  });

  it("recusa id fora da lista — o portal também recusaria, e mais tarde", () => {
    expect(motivoValido(4)).toBe(true);
    expect(motivoValido(7)).toBe(false);
    expect(motivoValido(null)).toBe(false);
    expect(motivoValido(undefined)).toBe(false);
  });

  it("traduz o id para o que a operação lê", () => {
    expect(rotuloDoMotivo(5)).toBe("Cotação de rota pendente");
    expect(rotuloDoMotivo(99)).toBeNull();
  });
});
