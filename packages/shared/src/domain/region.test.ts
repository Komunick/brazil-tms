import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { APP_TIME_ZONE } from "../formatting";
import { prazoDeAtribuicaoVencido, regionPosition, REGION_ORDER } from "./region";

/**
 * O PRAZO DE ATRIBUIÇÃO decide se o painel pisca vermelho. Errar por uma hora aqui é acender alarme
 * na operação inteira uma hora cedo, ou calar por uma hora quando já era para gritar.
 */
describe("prazoDeAtribuicaoVencido", () => {
  const emSaoPaulo = (hora: number, minuto = 0): DateTime =>
    DateTime.fromObject(
      { year: 2026, month: 8, day: 21, hour: hora, minute: minuto },
      { zone: APP_TIME_ZONE },
    );

  it("não venceu antes do meio-dia", () => {
    expect(prazoDeAtribuicaoVencido(emSaoPaulo(0))).toBe(false);
    expect(prazoDeAtribuicaoVencido(emSaoPaulo(11, 59))).toBe(false);
  });

  it("vence AO meio-dia, não depois dele", () => {
    expect(prazoDeAtribuicaoVencido(emSaoPaulo(12))).toBe(true);
  });

  it("segue vencido pelo resto do dia", () => {
    expect(prazoDeAtribuicaoVencido(emSaoPaulo(23, 59))).toBe(true);
  });

  /**
   * O painel é aberto de casa, de outro fuso, e de uma TV na operação. O prazo é o mesmo para todos:
   * quem decide é o relógio de São Paulo, não o de quem abriu a tela.
   */
  it("usa o meio-dia de São Paulo, não o do fuso de quem olha", () => {
    // 14h em Lisboa é 10h em São Paulo: ainda não venceu, embora já seja tarde para quem olha.
    const lisboa = DateTime.fromObject(
      { year: 2026, month: 8, day: 21, hour: 14 },
      { zone: "Europe/Lisbon" },
    );
    expect(lisboa.setZone(APP_TIME_ZONE).hour).toBe(10);
    expect(prazoDeAtribuicaoVencido(lisboa)).toBe(false);
  });
});

describe("regionPosition", () => {
  it("mantém a ordem declarada, não a alfabética", () => {
    const ordenadas = [...REGION_ORDER]
      .reverse()
      .sort((a, b) => regionPosition(a) - regionPosition(b));
    expect(ordenadas).toEqual([...REGION_ORDER]);
  });

  it("põe a região desconhecida no fim, e a sem região depois dela", () => {
    expect(regionPosition("NORTE")).toBe(REGION_ORDER.length);
    expect(regionPosition(null)).toBe(REGION_ORDER.length + 1);
  });
});
