import { describe, expect, it } from "vitest";
import {
  foldStationName,
  parsePortalExecution,
  splitStation,
  type PortalStopRow,
} from "./portal-execution";

/**
 * The portal export read as execution. Cases are taken from the customer's own file (310 trips,
 * 625 stops) — including the three-stop milk run that the planning spreadsheet could only express
 * by stacking two movements inside one cell.
 */

const stop = (over: Partial<PortalStopRow>): PortalStopRow => ({
  "LH Trip Number": "LT0Q8C02DT0E1",
  "LH Trip Name": "20260812Adhoc-S542207",
  Status: "Completed",
  "Driver ID": "[3763826]CAIO HENRIQUE TOMAZ AMORIM",
  Vehicle: "CARRETA",
  "Vehicle Plate Number": "NZR7F16",
  ...over,
});

/** The real milk run: Duque de Caxias → Belo Horizonte → Contagem. */
const MILK_RUN: PortalStopRow[] = [
  stop({
    "Station  Number": "1",
    Station: "[8300]SoC_RJ_Duque de Caxias",
    STA: "12/08/2026 22:40",
    STD: "12/08/2026 23:59",
    ATA: "12/08/2026 22:31",
    ATD: "12/08/2026 23:53",
  }),
  stop({
    "Station  Number": "2",
    Station: "[10102]LM Hub_MG_Belo Horizonte_02",
    STA: "13/08/2026 08:30",
    STD: "13/08/2026 10:30",
    ATA: "13/08/2026 08:11",
    ATD: "13/08/2026 09:14",
  }),
  stop({
    "Station  Number": "3",
    Station: "[5027]LM Hub_MG_Contagem_01",
    STA: "13/08/2026 11:30",
    STD: "",
    ATA: "13/08/2026 09:47",
    ATD: "",
  }),
];

describe("splitStation", () => {
  it("separates the portal's bracketed id from the name", () => {
    expect(splitStation("[8300]SoC_RJ_Duque de Caxias")).toEqual({
      stationId: "8300",
      stationName: "SoC_RJ_Duque de Caxias",
    });
  });

  it("keeps the whole cell as the name when there is no id to take", () => {
    expect(splitStation("SoC_RJ_Duque de Caxias")).toEqual({
      stationId: null,
      stationName: "SoC_RJ_Duque de Caxias",
    });
  });
});

describe("foldStationName", () => {
  it("matches the portal's spelling against the one the spreadsheet left in the TMS", () => {
    expect(foldStationName("SoC_RJ_Duque de Caxias")).toBe(
      foldStationName("SOC_RJ_DUQUE DE CAXIAS"),
    );
    expect(foldStationName("SoC_PE_Jaboatão dos Guararapes")).toBe(
      foldStationName("SOC_PE_JABOATAO DOS GUARARAPES"),
    );
  });

  it("does not collapse two different stations", () => {
    expect(foldStationName("LM Hub_MG_Contagem_01")).not.toBe(
      foldStationName("LM Hub_MG_Contagem_05"),
    );
  });
});

describe("parsePortalExecution", () => {
  it("turns three stops into TWO legs, in the file's own stop order", () => {
    const { trips, rejected } = parsePortalExecution(MILK_RUN);
    expect(rejected).toEqual([]);
    expect(trips).toHaveLength(1);

    const trip = trips[0]!;
    expect(trip.legs).toHaveLength(2);
    expect(trip.legs[0]!.origin.stationName).toBe("SoC_RJ_Duque de Caxias");
    expect(trip.legs[0]!.destination.stationName).toBe("LM Hub_MG_Belo Horizonte_02");
    expect(trip.legs[1]!.origin.stationName).toBe("LM Hub_MG_Belo Horizonte_02");
    expect(trip.legs[1]!.destination.stationName).toBe("LM Hub_MG_Contagem_01");
    expect(trip.legs.map((l) => l.legNumber)).toEqual([1, 2]);
  });

  it("carries the times that the TMS has never had: what the truck actually did", () => {
    const trip = parsePortalExecution(MILK_RUN).trips[0]!;
    const first = trip.legs[0]!;
    expect(first.origin.plannedArrival).toBe("12/08/2026 22:40");
    expect(first.origin.actualArrival).toBe("12/08/2026 22:31"); // chegou adiantado
    expect(first.origin.actualDeparture).toBe("12/08/2026 23:53");
    expect(first.destination.actualArrival).toBe("13/08/2026 08:11");
    // The last stop has no departure — the truck ended there.
    expect(trip.legs[1]!.destination.actualDeparture).toBeNull();
  });

  it("orders by the file's stop NUMBER, not by row order", () => {
    const shuffled = [MILK_RUN[2]!, MILK_RUN[0]!, MILK_RUN[1]!];
    const trip = parsePortalExecution(shuffled).trips[0]!;
    expect(trip.legs[0]!.origin.stationName).toBe("SoC_RJ_Duque de Caxias");
    expect(trip.legs[1]!.destination.stationName).toBe("LM Hub_MG_Contagem_01");
  });

  it("keeps the driver, plate and the portal's own status", () => {
    const trip = parsePortalExecution(MILK_RUN).trips[0]!;
    expect(trip.status).toBe("Completed");
    expect(trip.plateLabel).toBe("NZR7F16");
    expect(trip.driverLabel).toContain("CAIO HENRIQUE");
  });

  it("treats a still-running trip as usable — the times simply are not there yet", () => {
    const running = MILK_RUN.slice(0, 2).map((r) => ({
      ...r,
      Status: "Assigned",
      ATA: "",
      ATD: "",
    }));
    const trip = parsePortalExecution(running).trips[0]!;
    expect(trip.legs).toHaveLength(1);
    expect(trip.legs[0]!.origin.actualArrival).toBeNull();
    expect(trip.legs[0]!.origin.plannedArrival).toBe("12/08/2026 22:40");
  });

  it("REJECTS a trip with a single stop — one place is not a movement", () => {
    const { trips, rejected } = parsePortalExecution([MILK_RUN[0]!]);
    expect(trips).toEqual([]);
    expect(rejected[0]!.reason).toContain("uma parada só");
    expect(rejected[0]!.externalTripId).toBe("LT0Q8C02DT0E1");
  });

  it("drops a same-place leg but keeps the rest of the trip", () => {
    const repeated = [
      MILK_RUN[0]!,
      stop({ "Station  Number": "2", Station: "[8300]SoC_RJ_Duque de Caxias", STA: "x" }),
      MILK_RUN[2]!,
    ];
    const { trips, rejected } = parsePortalExecution(repeated);
    expect(trips[0]!.legs).toHaveLength(1); // Caxias→Caxias dropped, Caxias→Contagem kept
    expect(rejected[0]!.reason).toContain("origem e destino iguais");
  });

  it("reports a row with no LH instead of silently skipping it", () => {
    const { rejected } = parsePortalExecution([
      stop({ "LH Trip Number": "", "Station  Number": "1" }),
    ]);
    expect(rejected[0]!.reason).toContain("sem número de LH");
  });

  it("separates trips that share the file", () => {
    const other = MILK_RUN.slice(0, 2).map((r) => ({ ...r, "LH Trip Number": "LT9OUTRA1" }));
    const { trips } = parsePortalExecution([...MILK_RUN, ...other]);
    expect(trips.map((t) => t.externalTripId).sort()).toEqual(["LT0Q8C02DT0E1", "LT9OUTRA1"]);
  });
});
