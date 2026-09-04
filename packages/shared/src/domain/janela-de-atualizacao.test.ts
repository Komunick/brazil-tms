import { describe, expect, it } from "vitest";
import { avisoDaAtualizacao, HORA_DA_ATUALIZACAO, MINUTOS_DE_AVISO } from "./janela-de-atualizacao";

/**
 * A JANELA DIÁRIA DE ATUALIZAÇÃO (03/09, a pedido).
 *
 * ── O QUE ESTE ARQUIVO EXISTE PARA PEGAR ──────────────────────────────────────────────────────
 *
 * O fuso. O servidor roda em UTC e meio-dia em São Paulo é **15h em UTC** — uma conta feita sobre a
 * hora local do computador acerta na máquina de quem escreveu e erra em três horas em produção, com
 * o aviso aparecendo às 9h da manhã para a operação.
 *
 * Por isso todos os instantes abaixo são escritos em UTC **de propósito**, com o horário de São
 * Paulo anotado ao lado. Um teste escrito em hora local passaria com a implementação errada.
 */

/** 03/09/2026. Meio-dia em São Paulo é 15:00 em UTC. */
const utc = (hhmmss: string): Date => new Date(`2026-09-03T${hhmmss}Z`);

describe("avisoDaAtualizacao — dentro da janela", () => {
  it("às 12:00 em São Paulo (15:00 UTC) faltam 10 minutos", () => {
    const aviso = avisoDaAtualizacao(utc("15:00:00"));
    expect(aviso).not.toBeNull();
    expect(aviso?.minutosRestantes).toBe(10);
    expect(aviso?.horario).toBe("12:10");
  });

  it("às 12:05 faltam 5", () => {
    expect(avisoDaAtualizacao(utc("15:05:00"))?.minutosRestantes).toBe(5);
  });

  it("às 12:09:01 ainda falta 1 — arredonda para CIMA", () => {
    // Nunca "0 minutos": soaria como "já passou" justamente quando mais importa agir.
    expect(avisoDaAtualizacao(utc("15:09:01"))?.minutosRestantes).toBe(1);
  });

  it("às 12:09:59 ainda falta 1, e o aviso ainda está lá", () => {
    expect(avisoDaAtualizacao(utc("15:09:59"))?.minutosRestantes).toBe(1);
  });
});

describe("avisoDaAtualizacao — fora da janela", () => {
  it("às 11:59:59 ainda NÃO aparece — falta 10 min e 1 s", () => {
    expect(avisoDaAtualizacao(utc("14:59:59"))).toBeNull();
  });

  it("às 12:10 em ponto some — não existe estado 'atualizando'", () => {
    // O próprio reinício tira a página do ar; um aviso que sobrevivesse a ele estaria mentindo.
    expect(avisoDaAtualizacao(utc("15:10:00"))).toBeNull();
  });

  it("às 12:11 continua fora", () => {
    expect(avisoDaAtualizacao(utc("15:11:00"))).toBeNull();
  });

  it("de manhã cedo não aparece", () => {
    expect(avisoDaAtualizacao(utc("11:00:00"))).toBeNull(); // 08:00 em São Paulo
  });

  it("de madrugada não aparece", () => {
    expect(avisoDaAtualizacao(utc("04:00:00"))).toBeNull(); // 01:00 em São Paulo
  });
});

/**
 * ── O TESTE QUE DERRUBA A IMPLEMENTAÇÃO INGÊNUA ───────────────────────────────────────────────
 *
 * Estes dois instantes são os que separam "contou em São Paulo" de "contou em UTC". Se alguém trocar
 * o fuso — ou usar a hora local do processo —, um dos dois cai na hora.
 */
describe("o fuso é de São Paulo, não do servidor", () => {
  it("12:00 UTC NÃO é a janela — são 09:00 em São Paulo", () => {
    expect(
      avisoDaAtualizacao(utc("12:00:00")),
      "a conta está sendo feita em UTC: o aviso apareceria às 9h da manhã para a operação",
    ).toBeNull();
  });

  it("15:00 UTC É a janela — são 12:00 em São Paulo", () => {
    expect(
      avisoDaAtualizacao(utc("15:00:00")),
      "a conta está sendo feita em UTC: o aviso nunca apareceria no horário certo",
    ).not.toBeNull();
  });

  /**
   * A janela é DIÁRIA, então a conta tem de valer em qualquer data — inclusive na virada do mês e
   * do ano, onde uma implementação que montasse a data à mão erraria.
   */
  it("vale em qualquer dia, inclusive na virada do ano", () => {
    expect(avisoDaAtualizacao(new Date("2026-12-31T15:03:00Z"))?.minutosRestantes).toBe(7);
    expect(avisoDaAtualizacao(new Date("2027-01-01T15:03:00Z"))?.minutosRestantes).toBe(7);
  });
});

describe("os valores são os que a decisão diz", () => {
  it("a janela é 12:10 e o aviso começa 10 minutos antes", () => {
    expect(HORA_DA_ATUALIZACAO).toEqual({ hora: 12, minuto: 10 });
    expect(MINUTOS_DE_AVISO).toBe(10);
  });
});
