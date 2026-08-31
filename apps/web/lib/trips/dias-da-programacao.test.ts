import { describe, expect, it } from "vitest";
import { deslocamentoDoDia, diaDoDeslocamento } from "./dias-da-programacao";

describe("dias da programação — data ↔ deslocamento", () => {
  it("ontem é -1, hoje é 0, amanhã é 1", () => {
    expect(deslocamentoDoDia("2026-08-30", "2026-08-31")).toBe(-1);
    expect(deslocamentoDoDia("2026-08-31", "2026-08-31")).toBe(0);
    expect(deslocamentoDoDia("2026-09-01", "2026-08-31")).toBe(1);
  });

  it("atravessa a virada do MÊS sem contar errado", () => {
    // A janela vai de -2 a +7, então ela cruza a virada do mês uma vez por mês. Contar por número
    // do dia em vez de por tempo erraria justamente aqui — e só aqui, o que é o pior lugar.
    expect(deslocamentoDoDia("2026-09-02", "2026-08-31")).toBe(2);
    expect(deslocamentoDoDia("2026-08-29", "2026-09-01")).toBe(-3);
  });

  it("a ida e a volta fecham — é o que o filtro depende para esconder o dia certo", () => {
    const hoje = "2026-08-31";
    for (const d of [-2, -1, 0, 1, 2, 3, 7]) {
      expect(deslocamentoDoDia(diaDoDeslocamento(d, hoje), hoje)).toBe(d);
    }
  });

  it("atravessa o HORÁRIO DE VERÃO sem perder nem ganhar um dia", () => {
    /**
     * O Brasil não tem mais horário de verão, mas o navegador de quem abre a tela pode estar em
     * qualquer fuso — e é o relógio DELE que constrói as datas. Ancorar as duas pontas ao meio-dia
     * UTC é o que faz a subtração ser de calendário: sem isso, um dia de 23 ou 25 horas arredonda
     * para o vizinho e o filtro esconde o dia errado, sem erro nenhum aparecer.
     */
    expect(deslocamentoDoDia("2026-03-08", "2026-03-07")).toBe(1);
    expect(deslocamentoDoDia("2026-11-02", "2026-11-01")).toBe(1);
  });

  it("volta para a data certa na virada do ano", () => {
    expect(diaDoDeslocamento(2, "2026-12-31")).toBe("2027-01-02");
    expect(diaDoDeslocamento(-1, "2027-01-01")).toBe("2026-12-31");
  });
});
