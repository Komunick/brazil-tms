import { describe, expect, it } from "vitest";
import { frescorDoPortal, idadeDoPortalEmTexto, PORTAL_MINUTOS_ATE_AVISAR } from "./frescor";

/**
 * Este aviso nasceu de uma falha medida: em 2026-08-18 o robô do portal ficou SEIS HORAS sem
 * entregar nada — token do servidor abaixo do mínimo de 32 caracteres, 401 em todo ciclo — e nada na
 * tela denunciava. Chromium aberto, aba certa, site no ar, painel desenhando números.
 *
 * Os casos abaixo são os limites em que o aviso vira ruído (e a operação aprende a ignorar) ou deixa
 * de aparecer quando devia.
 */
const AGORA = new Date("2026-08-19T03:00:00Z");
const minutosAtras = (m: number): Date => new Date(AGORA.getTime() - m * 60_000);

describe("frescorDoPortal", () => {
  it("o ritmo normal do robô NÃO avisa", () => {
    // Plano a cada 15 min, execução a cada 5. Meia hora ainda é rotina — um ciclo que demorou, um
    // relatório pesado, uma sessão que se renovou.
    expect(frescorDoPortal(minutosAtras(5), AGORA).velho).toBe(false);
    expect(frescorDoPortal(minutosAtras(30), AGORA).velho).toBe(false);
    expect(frescorDoPortal(minutosAtras(59), AGORA).velho).toBe(false);
  });

  it("uma hora calado avisa — são quatro ciclos perdidos", () => {
    expect(frescorDoPortal(minutosAtras(PORTAL_MINUTOS_ATE_AVISAR), AGORA).velho).toBe(true);
    // O caso real: seis horas.
    expect(frescorDoPortal(minutosAtras(360), AGORA).velho).toBe(true);
  });

  it("nunca alimentado avisa, em vez de passar por 'tudo certo'", () => {
    // Sem este caso o aviso ficaria mudo justamente na pior situação — a de nunca ter funcionado.
    expect(frescorDoPortal(null, AGORA).velho).toBe(true);
    expect(frescorDoPortal(undefined, AGORA).velho).toBe(true);
    expect(frescorDoPortal("não é data", AGORA).velho).toBe(true);
  });

  it("carimbo no FUTURO também é sintoma", () => {
    // Já aconteceu neste projeto: o robô somava -03:00 a uma hora que já era UTC e todo carimbo
    // nascia três horas à frente. Sem o valor absoluto, idade negativa nunca cruza o limite.
    expect(frescorDoPortal(minutosAtras(-120), AGORA).velho).toBe(true);
    // Um minuto de diferença de relógio entre a VM e o servidor não pode virar alarme.
    expect(frescorDoPortal(minutosAtras(-1), AGORA).velho).toBe(false);
  });

  it("aceita o carimbo como texto, que é como ele chega da API", () => {
    expect(frescorDoPortal("2026-08-18T17:50:47Z", AGORA).velho).toBe(true);
    expect(frescorDoPortal("2026-08-19T02:50:00Z", AGORA).velho).toBe(false);
  });
});

describe("idadeDoPortalEmTexto", () => {
  it("conta em minutos até duas horas, depois em horas, depois em dias", () => {
    expect(idadeDoPortalEmTexto(75)).toBe("75 min");
    expect(idadeDoPortalEmTexto(119)).toBe("119 min");
    expect(idadeDoPortalEmTexto(360)).toBe("6 h");
    // Ninguém lê "4320 min" e entende "três dias" olhando uma TV de passagem.
    expect(idadeDoPortalEmTexto(4320)).toBe("3 dias");
  });

  it("idade negativa (carimbo no futuro) sai legível", () => {
    expect(idadeDoPortalEmTexto(-90)).toBe("90 min");
  });

  it("sem carimbo devolve nulo, para a tela usar a outra frase", () => {
    // "sem atualizar há Infinity min" seria pior que não avisar.
    expect(idadeDoPortalEmTexto(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
