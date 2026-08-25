import { describe, expect, it } from "vitest";
import { ehNova } from "./visto";

/**
 * A regra da PRIMEIRA visita é a que justifica este arquivo.
 *
 * As outras duas são triviais e se leem no código. Esta não: sem cookie, "novo" deixa de significar
 * "depois da última visita" e passa a significar "a mais recente que existe" — e uma mudança
 * descuidada aqui produz ou uma parede de selos, ou nenhum, sem que nada quebre.
 */
describe("ehNova", () => {
  const MAIS_RECENTE = "2026-08-25";

  it("na primeira visita, marca só a entrada mais recente", () => {
    expect(ehNova("2026-08-25", undefined, MAIS_RECENTE)).toBe(true);
    expect(ehNova("2026-08-24", undefined, MAIS_RECENTE)).toBe(false);
  });

  it("marca o que veio depois da última visita", () => {
    expect(ehNova("2026-08-25", "2026-08-23", MAIS_RECENTE)).toBe(true);
    expect(ehNova("2026-08-24", "2026-08-23", MAIS_RECENTE)).toBe(true);
  });

  it("não marca o que a pessoa já viu, nem a entrada do próprio dia da visita", () => {
    expect(ehNova("2026-08-23", "2026-08-23", MAIS_RECENTE)).toBe(false);
    expect(ehNova("2026-08-22", "2026-08-23", MAIS_RECENTE)).toBe(false);
  });

  /**
   * O caso que motivou guardar a DATA DA ENTRADA em vez da data da visita.
   *
   * Uma entrada acrescentada depois, com data retroativa, tem de aparecer como nova para quem já
   * passou por aqui — senão ela nasce lida e ninguém nunca a vê.
   */
  it("marca entrada retroativa acrescentada depois da visita", () => {
    // Visitou quando o topo era 22/08; entra agora uma entrada datada de 23/08.
    expect(ehNova("2026-08-23", "2026-08-22", "2026-08-23")).toBe(true);
  });
});
