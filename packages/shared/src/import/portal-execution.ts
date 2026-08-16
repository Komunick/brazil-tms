/**
 * The customer's PORTAL export (`agency_trip`), read as EXECUTION — what actually happened.
 *
 * This is a different shape from every other import the TMS has: one row per STOP, not per trip. A
 * trip with three stops is three rows, numbered, and the truck's movements are the gaps BETWEEN
 * them. So the file states a milk run structurally — the very thing the planning spreadsheet buried
 * inside one cell with Alt+Enter — and the transformation here is the one that turns N stops into
 * N-1 legs:
 *
 *     parada 1  Duque de Caxias   STA 22:40  STD 23:59   ATA 22:31  ATD 23:53
 *     parada 2  BH_02             STA 08:30  STD 10:30   ATA 08:11  ATD 09:14   →  2 legs
 *     parada 3  Contagem_01       STA 11:30              ATA 09:47
 *
 * What makes it worth the code: the A columns. `STA`/`STD` are the plan (which the TMS already has
 * from the planning file); `ATA`/`ATD` are what the truck DID — and the TMS has never had those from
 * anywhere. They arrive as real timestamps, so the trip timeline stops being a list of things people
 * declared and becomes a record of what happened.
 *
 * Pure: parses, groups and pairs. Resolving stations to locations and writing anything is the
 * caller's job.
 */

/** One row of the export, keyed by its column header. */
export interface PortalStopRow {
  "LH Trip Number"?: string;
  "LH Trip Name"?: string;
  Status?: string;
  "Driver ID"?: string;
  Vehicle?: string;
  "Vehicle Plate Number"?: string;
  /** NOTE the two spaces — the customer's header is "Station  Number". */
  "Station  Number"?: string;
  Station?: string;
  STA?: string;
  STD?: string;
  ATA?: string;
  ATD?: string;
}

/** A stop, after parsing: the station and the times it carries. */
export interface PortalStop {
  sequence: number;
  /** The raw station cell, e.g. "[8300]SoC_RJ_Duque de Caxias" — the caller resolves it. */
  stationValue: string;
  /** The portal's internal station id, when the cell carries one. */
  stationId: string | null;
  /** The station name without the bracketed id — what matches a TMS location name. */
  stationName: string;
  /** A label ("13/08/2026 09:47") from the export, or an epoch-second instant from the API. */
  plannedArrival: string | number | null;
  plannedDeparture: string | number | null;
  actualArrival: string | number | null;
  actualDeparture: string | number | null;
  /**
   * The loading and unloading steps, when the source states them. The portal's API does; the
   * spreadsheet export has no such columns and simply leaves them absent, producing no milestone.
   * Loading is read on a leg's ORIGIN, unloading on its DESTINATION.
   */
  loadingStarted?: string | number | null;
  loadedAt?: string | number | null;
  /** Breaking the seal — the truck was opened to be unloaded here. */
  unsealedAt?: string | number | null;
  unloadedAt?: string | number | null;
}

/** One movement: from one stop to the next, with the plan and what actually happened. */
export interface PortalLeg {
  legNumber: number;
  origin: PortalStop;
  destination: PortalStop;
}

export interface PortalTrip {
  externalTripId: string;
  tripName: string | null;
  /** The portal's own word: "Completed", "Cancelled", … — the caller decides what it means. */
  status: string | null;
  driverLabel: string | null;
  vehicleLabel: string | null;
  plateLabel: string | null;
  stops: PortalStop[];
  legs: PortalLeg[];
}

export interface PortalParseResult {
  trips: PortalTrip[];
  /** Rows that could not be used, with the reason — reported, never dropped in silence. */
  rejected: { row: number; externalTripId: string; reason: string }[];
}

const blank = (value: string | undefined): boolean =>
  value === undefined || value.trim() === "" || value.trim() === "-";

const text = (value: string | undefined): string | null => (blank(value) ? null : value!.trim());

/** "[8300]SoC_RJ_Duque de Caxias" → id "8300", name "SoC_RJ_Duque de Caxias". */
export function splitStation(value: string): { stationId: string | null; stationName: string } {
  const match = /^\s*\[(\d+)\]\s*(.*)$/.exec(value);
  if (!match) return { stationId: null, stationName: value.trim() };
  return { stationId: match[1]!, stationName: match[2]!.trim() };
}

/**
 * Group the export's rows into trips and pair each consecutive stop into a leg.
 *
 * A trip is rejected — never half-imported — when it cannot describe a movement: no id, a single
 * stop (nowhere to go), a stop with no station, or two stops that are the same place. The stop
 * ORDER comes from the file's own `Station  Number`, not from row order, because the export is not
 * guaranteed to be sorted and a swapped pair would invert a leg.
 */
export function parsePortalExecution(rows: PortalStopRow[]): PortalParseResult {
  const grouped = new Map<string, { row: number; raw: PortalStopRow }[]>();
  const rejected: PortalParseResult["rejected"] = [];

  rows.forEach((raw, index) => {
    const id = text(raw["LH Trip Number"]);
    if (!id) {
      rejected.push({ row: index + 1, externalTripId: "", reason: "Linha sem número de LH." });
      return;
    }
    grouped.set(id, [...(grouped.get(id) ?? []), { row: index + 1, raw }]);
  });

  const trips: PortalTrip[] = [];

  for (const [externalTripId, entries] of grouped) {
    const first = entries[0]!;
    const stops: PortalStop[] = [];
    let bad: string | null = null;

    for (const { raw } of entries) {
      const stationValue = text(raw.Station);
      if (!stationValue) {
        bad = "Parada sem estação.";
        break;
      }
      const sequence = Number.parseInt(text(raw["Station  Number"]) ?? "", 10);
      if (!Number.isFinite(sequence)) {
        bad = "Parada sem número.";
        break;
      }
      const { stationId, stationName } = splitStation(stationValue);
      stops.push({
        sequence,
        stationValue,
        stationId,
        stationName,
        plannedArrival: text(raw.STA),
        plannedDeparture: text(raw.STD),
        actualArrival: text(raw.ATA),
        actualDeparture: text(raw.ATD),
      });
    }

    if (!bad && stops.length < 2) bad = "A viagem tem uma parada só: não descreve um movimento.";

    if (bad) {
      rejected.push({ row: first.row, externalTripId, reason: bad });
      continue;
    }

    stops.sort((a, b) => a.sequence - b.sequence);

    const legs: PortalLeg[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const origin = stops[i]!;
      const destination = stops[i + 1]!;
      // A leg that starts and ends at the same station is not a movement; the rest of the trip is
      // still usable, so this drops the leg and keeps going rather than rejecting everything.
      if (origin.stationValue === destination.stationValue) {
        rejected.push({
          row: first.row,
          externalTripId,
          reason: `Perna ${legs.length + 1} com origem e destino iguais: ${origin.stationValue}.`,
        });
        continue;
      }
      legs.push({ legNumber: legs.length + 1, origin, destination });
    }

    if (legs.length === 0) {
      rejected.push({ row: first.row, externalTripId, reason: "Nenhuma perna utilizável." });
      continue;
    }

    trips.push({
      externalTripId,
      tripName: text(first.raw["LH Trip Name"]),
      status: text(first.raw.Status),
      driverLabel: text(first.raw["Driver ID"]),
      vehicleLabel: text(first.raw.Vehicle),
      plateLabel: text(first.raw["Vehicle Plate Number"]),
      stops,
      legs,
    });
  }

  return { trips, rejected };
}

/**
 * Accent/case/punctuation-folded station name, for matching the portal's spelling against a TMS
 * location name. The portal writes "SoC_RJ_Duque de Caxias"; the same site arrived from the
 * planning spreadsheet as "SOC_RJ_DUQUE DE CAXIAS". Same place, three differences that no exact
 * comparison survives.
 */
export function foldStationName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}
