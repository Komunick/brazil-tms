import { TRANSITIONS, TRIP_STATUSES, type TripStatus } from "../domain/trip-status";
import type { PortalLeg } from "./portal-execution";

/**
 * From what the truck DID to what the trip IS — the pure half of writing the portal's execution
 * into the TMS (2026-08-16).
 *
 * The portal records four instants per leg. Each one, once it exists, means the trip has passed a
 * point of the lifecycle:
 *
 *     origin  ATA  → chegou na origem      at_origin
 *     origin  ATD  → saiu, está na estrada  in_transit
 *     dest    ATA  → chegou no destino      at_destination
 *     (the portal calls the trip Completed)  completed
 *
 * `milestonesFor` turns a leg into that list, in order, each carrying its REAL timestamp. Nothing
 * is inferred: a missing instant produces no milestone, and a trip that is halfway simply stops
 * halfway. The furthest one reached is the trip's status.
 *
 * Everything here is a pure function of the leg. Deciding whether to apply it — the trip exists, it
 * is not already further along, nobody moved it by hand meanwhile — belongs to the caller.
 */

export interface PortalMilestone {
  status: TripStatus;
  /** When it actually happened, per the customer's own record. Never invented. */
  at: Date;
  /** The event the TMS records alongside the status change. */
  eventType: "origin_arrived" | "departed" | "destination_arrived";
}

/**
 * `13/08/2026 09:47` in São Paulo → a UTC instant. The portal writes wall-clock local time with no
 * zone, exactly like the planning spreadsheet, so it is read the same way. Returns null for a blank
 * or unparseable cell — the caller reports it, never guesses.
 */
export function parsePortalInstant(value: string | null, offsetMinutes = -180): Date | null {
  if (value == null) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = match;
  const utcMs = Date.UTC(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(mi),
    Number(ss ?? "0"),
  );
  const instant = new Date(utcMs - offsetMinutes * 60_000);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** The milestones a leg proves, oldest first. */
export function milestonesFor(leg: PortalLeg): PortalMilestone[] {
  const out: PortalMilestone[] = [];
  const originArrival = parsePortalInstant(leg.origin.actualArrival);
  const originDeparture = parsePortalInstant(leg.origin.actualDeparture);
  const destinationArrival = parsePortalInstant(leg.destination.actualArrival);

  if (originArrival)
    out.push({ status: "at_origin", at: originArrival, eventType: "origin_arrived" });
  if (originDeparture)
    out.push({ status: "in_transit", at: originDeparture, eventType: "departed" });
  if (destinationArrival) {
    out.push({
      status: "at_destination",
      at: destinationArrival,
      eventType: "destination_arrived",
    });
  }
  return out;
}

/** Position in the lifecycle; `TRIP_STATUSES` is declared in order, so position IS progress. */
export function progressOf(status: TripStatus): number {
  return TRIP_STATUSES.indexOf(status);
}

/**
 * Shortest path of DECLARED transitions from `from` to `to` — the trip walks its own machine, it
 * never teleports. `cancelled` is terminal and is only ever a destination.
 */
export function pathBetween(from: TripStatus, to: TripStatus): TripStatus[] | null {
  if (from === to) return [];
  const queue: TripStatus[][] = [[from]];
  const seen = new Set<TripStatus>([from]);
  while (queue.length) {
    const path = queue.shift()!;
    const last = path[path.length - 1]!;
    for (const next of TRANSITIONS[last] ?? []) {
      if (seen.has(next)) continue;
      if (next === "cancelled" && to !== "cancelled") continue;
      const extended = [...path, next];
      if (next === to) return extended.slice(1);
      seen.add(next);
      queue.push(extended);
    }
  }
  return null;
}

export interface PlannedHop {
  status: TripStatus;
  /** The real instant, when this hop is one the portal timed; null for a step passed through. */
  at: Date | null;
  eventType: PortalMilestone["eventType"] | null;
}

/**
 * The hops to write so a trip currently at `current` reaches everything the portal proves, with the
 * real instant stamped on the hops the portal timed and NULL on the ones merely passed through
 * (`confirmed` on the way to `at_origin`, say — nobody recorded a time for it, so none is invented).
 *
 * Returns an empty list when the trip is already at or past the furthest milestone: the file is
 * behind the TMS, and re-importing yesterday's export must be a no-op.
 */
export function hopsToApply(current: TripStatus, milestones: PortalMilestone[]): PlannedHop[] {
  const timed = new Map<TripStatus, PortalMilestone>();
  for (const m of milestones) timed.set(m.status, m);

  const furthest = milestones.reduce<TripStatus | null>(
    (best, m) => (best == null || progressOf(m.status) > progressOf(best) ? m.status : best),
    null,
  );
  if (furthest == null) return [];
  if (progressOf(furthest) <= progressOf(current)) return [];

  const path = pathBetween(current, furthest);
  if (!path) return [];

  return path.map((status) => {
    const milestone = timed.get(status);
    return {
      status,
      at: milestone?.at ?? null,
      eventType: milestone?.eventType ?? null,
    };
  });
}
