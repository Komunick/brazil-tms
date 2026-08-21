import { describe, expect, it } from "vitest";
import { FLEET_ALERT_KEYS, fleetAlerts, type FleetAlertSource } from "./fleet-alerts";

/**
 * Os valores aqui NÃO são inventados: são os que vieram na leitura de 21/08/2026 das 12h29, num
 * lote de 85 veículos, e cada polaridade foi conferida contra a COR do ícone na tela do fornecedor.
 * É por isso que o teste afirma `MAI`/`MEN` e `MAI`/`MOV` como coisas diferentes — parecem o mesmo
 * par e não são.
 */
const AGORA = Date.parse("2026-08-21T15:29:00Z");

function base(over: Partial<FleetAlertSource> = {}): FleetAlertSource {
  return {
    offRoute: "N",
    stoppedFlag: "MOV",
    drivingTimeFlag: "MEN",
    lateStartFlag: "N",
    blockedFlag: "N",
    sirenFlag: "N",
    releaseLabel: "",
    positionAt: new Date(AGORA - 4 * 60_000).toISOString(),
    noPositionLimitMinutes: 60,
    ...over,
  };
}

describe("fleetAlerts", () => {
  it("frota saudável não acende nenhum dos oito", () => {
    expect([...fleetAlerts(base(), AGORA)]).toEqual([]);
  });

  it("cada farol aceso responde pelo seu, e só pelo seu", () => {
    const casos: Array<[Partial<FleetAlertSource>, string]> = [
      [{ offRoute: "S" }, "foraDeRota"],
      [{ stoppedFlag: "MAI" }, "paradoDemais"],
      [{ drivingTimeFlag: "MAI" }, "jornadaExcedida"],
      [{ lateStartFlag: "S" }, "inicioAtrasado"],
      [{ blockedFlag: "S" }, "bloqueio"],
      [{ sirenFlag: "S" }, "sirene"],
      [{ releaseLabel: "LIBERACAO 4823" }, "liberacao"],
    ];
    for (const [campo, esperado] of casos) {
      expect([...fleetAlerts(base(campo), AGORA)]).toEqual([esperado]);
    }
  });

  /**
   * O ALFINETE É DERIVADO, e este é o caso que provou a regra: o GFW5H95 tinha posição das 11h16
   * com o relógio em 12h29 — 73 minutos — e era o único vermelho do lote. `GRJ_FAROLSEMPOSICAO`
   * vinha `"S"` para ele E para os 84 verdes, o que é a razão de o campo não servir.
   */
  it("o alfinete de posição acende pelo tempo de silêncio, não por um campo", () => {
    const dentro = base({ positionAt: new Date(AGORA - 59 * 60_000).toISOString() });
    expect(fleetAlerts(dentro, AGORA).has("semPosicao")).toBe(false);

    const fora = base({ positionAt: new Date(AGORA - 73 * 60_000).toISOString() });
    expect(fleetAlerts(fora, AGORA).has("semPosicao")).toBe(true);
  });

  it("o limite é o que o RASTREADOR informa, não uma constante nossa", () => {
    const trintaMin = base({
      positionAt: new Date(AGORA - 40 * 60_000).toISOString(),
      noPositionLimitMinutes: 30,
    });
    expect(fleetAlerts(trintaMin, AGORA).has("semPosicao")).toBe(true);
  });

  it("nunca ter comunicado acende — é o caso mais grave de estar mudo", () => {
    expect(fleetAlerts(base({ positionAt: null }), AGORA).has("semPosicao")).toBe(true);
  });

  /**
   * Leitura de robô ANTIGO: os cinco campos novos chegam nulos. Nulo não pode virar alerta aceso —
   * pintaria a frota inteira de vermelho no minuto seguinte ao deploy, antes de o robô ser
   * atualizado — nem pode ser confundido com "verificado e está tudo bem" no alfinete, que é
   * derivado e continua valendo.
   */
  it("campos ausentes não inventam alerta, mas o de posição continua valendo", () => {
    const velho: FleetAlertSource = {
      offRoute: "N",
      stoppedFlag: "MOV",
      drivingTimeFlag: null,
      lateStartFlag: null,
      blockedFlag: null,
      sirenFlag: null,
      releaseLabel: null,
      positionAt: new Date(AGORA - 2 * 60_000).toISOString(),
      noPositionLimitMinutes: null,
    };
    expect([...fleetAlerts(velho, AGORA)]).toEqual([]);
  });

  it("os oito têm a ordem da tela do fornecedor", () => {
    expect(FLEET_ALERT_KEYS).toEqual([
      "foraDeRota",
      "paradoDemais",
      "jornadaExcedida",
      "semPosicao",
      "inicioAtrasado",
      "bloqueio",
      "sirene",
      "liberacao",
    ]);
  });
});
