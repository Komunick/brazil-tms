import { describe, expect, it } from "vitest";
import { FOLGA_DO_CICLO, saudeDoCiclo } from "./saude";

/**
 * O AVISO QUE CHEGA ANTES DO DADO PARAR (2026-08-21).
 *
 * A régua de idade pega a parada, mas só depois dela. Quando o navegador da VM começa a sufocar, o
 * ciclo estica primeiro: configurado para 10 segundos, passa a levar 45. O dado ainda chega, só que
 * velho — e a tela diria "ok" enquanto a operação decide sobre um retrato de um minuto atrás.
 */
describe("saudeDoCiclo", () => {
  it("um ciclo dentro do prometido está no ritmo", () => {
    expect(saudeDoCiclo(10_000, 3_000).saude).toBe("ok");
  });

  /**
   * A folga não é generosidade: um ciclo é rede mais parsing mais gravação, e variar é normal.
   * Acusar no primeiro que passar de 10,1s criaria um alarme que pisca o dia inteiro — e alarme que
   * pisca sempre é alarme que ninguém olha.
   */
  it("tolera variação até a folga, e acusa acima dela", () => {
    expect(saudeDoCiclo(10_000, 10_000 * FOLGA_DO_CICLO).saude).toBe("ok");
    expect(saudeDoCiclo(10_000, 10_000 * FOLGA_DO_CICLO + 1).saude).toBe("lento");
  });

  it("o caso que motivou tudo: configurado 10s, levando 45s", () => {
    const { saude, razao } = saudeDoCiclo(10_000, 45_000);
    expect(saude).toBe("lento");
    expect(razao).toBe(4.5);
  });

  /**
   * Robô antigo, ainda não atualizado, não manda pulso. Isso é ausência de informação, NÃO um
   * problema — chamar de "lento" ensinaria a operação a ignorar o aviso já no primeiro dia.
   */
  it("sem pulso não é lento, é sem dado", () => {
    expect(saudeDoCiclo(null, null).saude).toBe("sem_dado");
    expect(saudeDoCiclo(10_000, null).saude).toBe("sem_dado");
    expect(saudeDoCiclo(null, 45_000).saude).toBe("sem_dado");
  });

  it("intervalo zero ou negativo não vira divisão maluca", () => {
    expect(saudeDoCiclo(0, 45_000).saude).toBe("sem_dado");
    expect(saudeDoCiclo(-1, 45_000).saude).toBe("sem_dado");
  });
});
