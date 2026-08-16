import type { PortalLeg, PortalParseResult, PortalStop, PortalTrip } from "./portal-execution";

/**
 * The customer's portal, read straight from its own API instead of from a file somebody exported
 * (2026-08-16).
 *
 * The file path (`parsePortalExecution`) exists because a human clicks "Exportar" and uploads the
 * result. The API states the same trips — richer, actually — and a script on a logged-in machine can
 * ask for them every few minutes. What must NOT differ is what happens next: both paths produce the
 * same `PortalTrip[]`, so plan-apply, milestones, station resolution and the import history are one
 * implementation, tested once.
 *
 * The mapping is deliberately dumb, and lives HERE rather than in the browser script: a script on a
 * VM is hard to update and impossible to test, so it only fetches and forwards. Every judgement about
 * the payload is made in this file, under test.
 *
 * Shape (captured from the live portal, 2026-08-16 — the two listings return the SAME item):
 *   GET /api/line_haul/agency/trip/list?query_type=1&sta=<from>,<to>&pageno&count&agency_current_station_id
 *   GET /api/line_haul/agency/trip/history/list?mtime=<from>,<to>&pageno&count&agency_current_station_id
 *   → { retcode, message, data: { pageno, count, total, list: [ trip ] } }
 *
 * A trip carries `trip_number` (the LH id), `trip_status`, `vehicle_type_name`, `driver_name`,
 * `vehicle_number` and a `trip_station[]` of stops with `station_code`, `station_name` and the four
 * instants (`sta`/`std`/`ata`/`atd`) as epoch seconds, where 0 means "not yet".
 */

/** The envelope both listings answer with. Unknown/extra fields are ignored, never rejected. */
export interface PortalApiEnvelope {
  retcode?: number;
  message?: string;
  data?: {
    pageno?: number;
    count?: number;
    total?: number;
    list?: unknown[];
  };
}

/**
 * The portal's numeric trip status → the label the TMS config already speaks (`status_mappings`,
 * `closedStatusLabels`).
 *
 * The codes are NOT 1..n and were not guessed — they were measured against the live portal on
 * 2026-08-16, because reading one of them as "Cancelled" cancels real trips in the TMS:
 *
 *   4   (79 trips)  no driver, no departure, no arrival            → planned
 *   5   (21 trips)  driver on all 21, still no movement            → assigned
 *   90  (211 trips) 211/211 arrived at the FINAL stop, every stop
 *                   with an arrival time                            → completed
 *   100 (89 trips)  0/89 reached the final stop, though 43 had
 *                   departed and turned back                        → ended without delivering
 *
 * The 90/100 split is what makes the mapping safe: arrival at the last stop is present in every
 * single 90 and in no 100 at all.
 *
 * An UNKNOWN code deliberately passes through as `Status <n>`: it matches no `closedStatusLabels`
 * entry, so a code we have never seen can create or update a trip but can never close or cancel one.
 */
const TRIP_STATUS_LABEL: Record<number, string> = {
  4: "Planned",
  5: "Assigned",
  90: "Completed",
  100: "Cancelled",
};

const trimmed = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" || text === "-" ? null : text;
};

const positive = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

/**
 * The station cell the rest of the pipeline expects — `"[8300]SoC_RJ_Duque de Caxias"`. The API hands
 * the id and the name apart, so the pair is rebuilt in that shape rather than teaching every consumer
 * a second format. `station_code` is the OPERATIONAL code and is NOT the id the TMS reconciles by
 * (`locations.external_station_id`); `station` is.
 */
function stationValue(stationId: string | null, stationName: string | null): string {
  if (stationId && stationName) return `[${stationId}]${stationName}`;
  return stationName ?? (stationId ? `[${stationId}]` : "");
}

function toStop(raw: Record<string, unknown>, index: number): PortalStop {
  const stationId = positive(raw.station) != null ? String(raw.station) : null;
  const stationName = trimmed(raw.station_name);
  return {
    sequence: typeof raw.sequence_number === "number" ? raw.sequence_number : index + 1,
    stationValue: stationValue(stationId, stationName),
    stationId,
    stationName: stationName ?? "",
    plannedArrival: positive(raw.sta),
    plannedDeparture: positive(raw.std),
    actualArrival: positive(raw.ata),
    actualDeparture: positive(raw.atd),
  };
}

/**
 * One API payload → the canonical trips. A trip with fewer than two stops states no movement and is
 * rejected with its reason (same rule as the file path: a leg needs an origin AND a destination).
 */
export function mapPortalApiTrips(payload: PortalApiEnvelope): PortalParseResult {
  const trips: PortalTrip[] = [];
  const rejected: PortalParseResult["rejected"] = [];

  const list = Array.isArray(payload?.data?.list) ? payload.data!.list! : [];

  list.forEach((entry, index) => {
    const raw = (entry ?? {}) as Record<string, unknown>;
    const externalTripId = trimmed(raw.trip_number);
    if (!externalTripId) {
      rejected.push({ row: index + 1, externalTripId: "", reason: "Viagem sem número (LH)." });
      return;
    }

    const stopsRaw = Array.isArray(raw.trip_station) ? (raw.trip_station as unknown[]) : [];
    const stops = stopsRaw
      .map((s, i) => toStop((s ?? {}) as Record<string, unknown>, i))
      .filter((s) => s.stationValue !== "")
      .sort((a, b) => a.sequence - b.sequence);

    if (stops.length < 2) {
      rejected.push({
        row: index + 1,
        externalTripId,
        reason: "Viagem com menos de duas paradas: nenhum movimento a registrar.",
      });
      return;
    }

    const legs: PortalLeg[] = [];
    for (let i = 0; i + 1 < stops.length; i += 1) {
      legs.push({ legNumber: i + 1, origin: stops[i]!, destination: stops[i + 1]! });
    }

    const statusCode = typeof raw.trip_status === "number" ? raw.trip_status : null;
    trips.push({
      externalTripId,
      tripName: trimmed(raw.trip_name),
      status: statusCode == null ? null : (TRIP_STATUS_LABEL[statusCode] ?? `Status ${statusCode}`),
      driverLabel: trimmed(raw.driver_name),
      vehicleLabel: trimmed(raw.vehicle_type_name),
      plateLabel: trimmed(raw.vehicle_number),
      stops,
      legs,
    });
  });

  return { trips, rejected };
}
