import { describe, expect, it } from "vitest";
import type { PortalParseResult, PortalTrip } from "@brazil-tms/shared";
import { semAsPropostasEmAberto } from "./portal-feed";

/**
 * O filtro que separa a viagem NOSSA da proposta que o portal ainda está oferecendo (2026-08-23).
 *
 * Existe porque 24 propostas em aberto estavam acendendo a faixa LH ATRASADA no painel, e o usuário
 * as reconheceu pela rota: "nenhuma dessas rotas é nossa". O portal sempre disse de quem eram —
 * `agency_id`, com `0` para as sem dono.
 */

function viagem(externalTripId: string, agencyId?: number | null): PortalTrip {
  return {
    externalTripId,
    tripName: null,
    status: null,
    driverLabel: null,
    agencyId,
    vehicleLabel: null,
    plateLabel: null,
    stops: [],
    legs: [],
  };
}

function resultado(...trips: PortalTrip[]): PortalParseResult {
  return { trips, rejected: [] };
}

describe("semAsPropostasEmAberto", () => {
  it("tira a proposta sem transportadora e mantém a nossa", () => {
    const saida = semAsPropostasEmAberto(
      resultado(viagem("LH-NOSSA", 1450), viagem("LH-ABERTA", 0)),
    );
    expect(saida.trips.map((t) => t.externalTripId)).toEqual(["LH-NOSSA"]);
  });

  it("REJEITA em vez de descartar em silêncio, com o motivo escrito", () => {
    // Descarte mudo faria o dia em que o portal mexer no campo passar como "dia sem viagens".
    const saida = semAsPropostasEmAberto(resultado(viagem("LH-ABERTA", 0)));
    expect(saida.rejected).toHaveLength(1);
    expect(saida.rejected[0]!.externalTripId).toBe("LH-ABERTA");
    expect(saida.rejected[0]!.reason).toMatch(/proposta em aberto/i);
  });

  it("quem não informa a transportadora passa — ausência não é acusação", () => {
    // A planilha não tem o campo, e nem toda listagem do portal o traz.
    const saida = semAsPropostasEmAberto(resultado(viagem("LH-PLANILHA"), viagem("LH-NULA", null)));
    expect(saida.trips).toHaveLength(2);
    expect(saida.rejected).toHaveLength(0);
  });

  it("sem nenhuma em aberto devolve o mesmo objeto, sem remontar a lista", () => {
    const entrada = resultado(viagem("LH-NOSSA", 1450));
    expect(semAsPropostasEmAberto(entrada)).toBe(entrada);
  });
});
