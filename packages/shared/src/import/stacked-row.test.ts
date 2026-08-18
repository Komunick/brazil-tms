import { describe, expect, it } from "vitest";
import type { TemplateConfig } from "../schemas/import";
import { expandStackedRow } from "./stacked-row";

/**
 * A milk run stacked inside ONE row (2026-08-15). Cases mirror the customer's own file: 38 rows of
 * the first real schedule wrote a chained operation with Alt+Enter inside the station and time
 * cells instead of on two lines.
 */

const TEMPLATE: TemplateConfig = {
  customerId: "00000000-0000-4000-8000-000000000000",
  name: "Programação Shopee",
  version: 1,
  fileType: "xlsx",
  columnMappings: [
    { source: "LH", target: "externalTripId", required: true },
    { source: "ESTAÇÃO ORIGEM", target: "originCode", required: true },
    { source: "ESTAÇÃO DESTINO", target: "destinationCode", required: true },
    { source: "ETA ORIGEM", target: "plannedPickupWindowStart" },
    { source: "CPT ORIGEM", target: "plannedPickupWindowEnd" },
    { source: "MOTORISTA", target: "resource.driverName" },
    { source: "REGIÃO", target: "customer.Região" },
  ],
  parsingRules: {
    dateFormats: ["dd/MM/yyyy HH:mm"],
    timezone: "America/Sao_Paulo",
    decimalSeparator: ",",
    thousandSeparator: ".",
  },
  requiredOverrides: [],
  closedStatusLabels: [],
};

/** The real shape: two stations, two times, ONE driver for the whole operation. */
const STACKED: Record<string, string> = {
  LH: "LT0Q8I02DX881",
  "ESTAÇÃO ORIGEM": "SOC-RJ2 | SOC_RJ_DUQUE DE CAXIAS\nHUB-LMG-50 | LM HUB_MG_BELO HORIZONTE_02",
  "ESTAÇÃO DESTINO": "HUB-LMG-50 | LM HUB_MG_BELO HORIZONTE_02\nHUB-LMG-05 | LM HUB_MG_CONTAGEM",
  "ETA ORIGEM": "01/07/2026 16:00\n02/07/2026 02:00",
  "CPT ORIGEM": "01/07/2026 18:00\n02/07/2026 04:00",
  MOTORISTA: "FULANO DE TAL",
  REGIÃO: "SUDESTE",
};

describe("expandStackedRow", () => {
  it("leaves an ordinary single-movement row untouched", () => {
    const raw = {
      ...STACKED,
      "ESTAÇÃO ORIGEM": "SOC-RJ2 | X",
      "ESTAÇÃO DESTINO": "HUB-LMG-50 | Y",
    };
    const legs = expandStackedRow(raw, TEMPLATE);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toBe(raw); // the very same object: no copying, no rewriting
  });

  it("splits the stacked row into one raw row per leg, in file order", () => {
    const legs = expandStackedRow(STACKED, TEMPLATE);
    expect(legs).toHaveLength(2);
    expect(legs[0]!["ESTAÇÃO ORIGEM"]).toBe("SOC-RJ2 | SOC_RJ_DUQUE DE CAXIAS");
    expect(legs[0]!["ESTAÇÃO DESTINO"]).toBe("HUB-LMG-50 | LM HUB_MG_BELO HORIZONTE_02");
    expect(legs[1]!["ESTAÇÃO ORIGEM"]).toBe("HUB-LMG-50 | LM HUB_MG_BELO HORIZONTE_02");
    expect(legs[1]!["ESTAÇÃO DESTINO"]).toBe("HUB-LMG-05 | LM HUB_MG_CONTAGEM");
  });

  it("gives each leg its own times", () => {
    const legs = expandStackedRow(STACKED, TEMPLATE);
    expect(legs[0]!["ETA ORIGEM"]).toBe("01/07/2026 16:00");
    expect(legs[1]!["ETA ORIGEM"]).toBe("02/07/2026 02:00");
    expect(legs[1]!["CPT ORIGEM"]).toBe("02/07/2026 04:00");
  });

  it("shares a single-line NON-date cell with every leg (one driver runs the whole operation)", () => {
    const legs = expandStackedRow(STACKED, TEMPLATE);
    expect(legs[0]!.MOTORISTA).toBe("FULANO DE TAL");
    expect(legs[1]!.MOTORISTA).toBe("FULANO DE TAL");
    expect(legs[1]!.REGIÃO).toBe("SUDESTE");
    expect(legs[1]!.LH).toBe("LT0Q8I02DX881"); // same programming id → the legs of one trip
  });

  it("never copies leg 1's TIME onto a later leg — an absent schedule stays absent", () => {
    // Three rows of the real file typed the stations stacked but only ONE time.
    const legs = expandStackedRow({ ...STACKED, "ETA ORIGEM": "01/07/2026 16:00" }, TEMPLATE);
    expect(legs[0]!["ETA ORIGEM"]).toBe("01/07/2026 16:00");
    expect(legs[1]!["ETA ORIGEM"]).toBe(""); // validate then refuses this leg by name
  });

  it("leaves the row whole when the two ends disagree on how many movements there are", () => {
    const raw = {
      ...STACKED,
      "ESTAÇÃO DESTINO": "HUB-LMG-50 | A\nHUB-LMG-05 | B\nHUB-LMG-07 | C",
    };
    const legs = expandStackedRow(raw, TEMPLATE);
    expect(legs).toHaveLength(1); // 2 origins vs 3 destinations: pairing them would invent a trip
  });

  it("ignores a trailing blank line (a stray Alt+Enter is not a leg)", () => {
    const raw = {
      ...STACKED,
      "ESTAÇÃO ORIGEM": "SOC-RJ2 | X\n",
      "ESTAÇÃO DESTINO": "HUB | Y\n  \n",
    };
    expect(expandStackedRow(raw, TEMPLATE)).toHaveLength(1);
  });

  it("assigns by index without recycling when some other cell has a mismatched line count", () => {
    const legs = expandStackedRow({ ...STACKED, REGIÃO: "SUDESTE\nSUL\nNORDESTE" }, TEMPLATE);
    expect(legs[0]!.REGIÃO).toBe("SUDESTE");
    expect(legs[1]!.REGIÃO).toBe("SUL"); // the third line has no leg; it is dropped, not reused
  });

  it("is inert for a template that maps no origin/destination", () => {
    const template = {
      ...TEMPLATE,
      columnMappings: [{ source: "LH", target: "externalTripId", required: true }],
    };
    expect(expandStackedRow(STACKED, template)).toHaveLength(1);
  });
});
