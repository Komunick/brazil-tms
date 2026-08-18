import { describe, expect, it } from "vitest";
import { BSC_HORAS_ATE_AVISAR, frescorDoBsc, idadeEmTexto } from "./frescor";

/**
 * O aviso existe porque o BSC falha PARADO: o robô se recusa a mandar (certo) e o painel segue
 * mostrando o último número, com a cor certa, parecendo atual. Os casos abaixo são os limites em que
 * um aviso mal calibrado vira ruído — ou não aparece quando devia.
 */
const AGORA = new Date("2026-08-18T13:00:00Z");
const horasAtras = (h: number): Date => new Date(AGORA.getTime() - h * 3_600_000);

describe("frescorDoBsc", () => {
  it("um dia normal NÃO avisa", () => {
    // O relatório fecha de madrugada; às 13h de um dia qualquer o dado tem ~9 horas, e no fim da
    // noite chega a 20. Avisar aí seria ensinar a operação a ignorar o aviso.
    expect(frescorDoBsc(horasAtras(9), AGORA).velho).toBe(false);
    expect(frescorDoBsc(horasAtras(20), AGORA).velho).toBe(false);
    expect(frescorDoBsc(horasAtras(29.9), AGORA).velho).toBe(false);
  });

  it("a publicação da madrugada que não veio avisa", () => {
    expect(frescorDoBsc(horasAtras(BSC_HORAS_ATE_AVISAR), AGORA).velho).toBe(true);
    expect(frescorDoBsc(horasAtras(72), AGORA).velho).toBe(true);
  });

  it("carimbo no FUTURO também é sintoma", () => {
    /**
     * Não é hipótese: o robô somava -03:00 a uma hora que já era UTC, e todo carimbo nascia três
     * horas à frente. Dado do futuro nunca aparece como erro — aparece como o dado mais fresco que
     * existe. Sem o valor absoluto, a idade negativa nunca cruzaria o limite e o painel jamais
     * acusaria um relógio errado.
     */
    expect(frescorDoBsc(horasAtras(-40), AGORA).velho).toBe(true);
    // Três horas à frente é o erro clássico e ainda assim pequeno: não vira alarme.
    expect(frescorDoBsc(horasAtras(-3), AGORA).velho).toBe(false);
  });

  it("aceita o carimbo como texto, que é como ele chega da API", () => {
    expect(frescorDoBsc("2026-08-15T13:00:00Z", AGORA).velho).toBe(true);
  });
});

describe("idadeEmTexto", () => {
  it("conta em horas até dois dias e em dias depois", () => {
    expect(idadeEmTexto(31)).toBe("31 h");
    expect(idadeEmTexto(47.4)).toBe("47 h");
    // Ninguém converte 73 horas de cabeça enquanto olha uma TV de passagem.
    expect(idadeEmTexto(73)).toBe("3 dias");
  });

  it("idade negativa (carimbo no futuro) sai legível, e não como '-40 h'", () => {
    expect(idadeEmTexto(-40)).toBe("40 h");
  });
});
