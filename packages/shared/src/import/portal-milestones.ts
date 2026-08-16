import { TRANSITIONS, TRIP_STATUSES, type TripStatus } from "../domain/trip-status";
import type { PortalLeg } from "./portal-execution";

/**
 * From what the truck DID to what the trip IS — the pure half of writing the portal's execution
 * into the TMS (2026-08-16).
 *
 * The portal records several instants per leg. Each one, once it exists, means the trip has passed a
 * point of the lifecycle:
 *
 *     origin  ATA           → chegou na origem       at_origin
 *     origin  loading_time  → começou a carregar     loading          (só na API)
 *     origin  loaded_time   → carregado              loaded           (só na API)
 *     origin  ATD           → saiu, está na estrada  in_transit
 *     dest    ATA           → chegou no destino      at_destination
 *     (the portal calls the trip Completed)          completed
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
  /** The event the TMS records alongside the status change; null when the step has none. */
  eventType: "origin_arrived" | "loaded" | "departed" | "destination_arrived" | "unloaded" | null;
}

/**
 * `13/08/2026 09:47` in São Paulo → a UTC instant. The portal's EXPORT writes wall-clock local time
 * with no zone, exactly like the planning spreadsheet, so it is read the same way. Returns null for a
 * blank or unparseable cell — the caller reports it, never guesses.
 *
 * Its API states the same instants as **epoch seconds** instead (2026-08-16). A number is therefore
 * accepted verbatim: an epoch already IS the instant, with no zone to interpret and nothing to get
 * wrong. `0` means "not yet" in that API — every unreached milestone comes back as zero, not null —
 * so it reads as absent, exactly like a blank cell.
 */
export function parsePortalInstant(
  value: string | number | null,
  offsetMinutes = -180,
): Date | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    // Seconds, not milliseconds: the portal's own `sta`/`mtime` query params are 10-digit epochs.
    const instant = new Date(value * 1000);
    return Number.isNaN(instant.getTime()) ? null : instant;
  }
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
  const loadingStarted = parsePortalInstant(leg.origin.loadingStarted ?? null);
  const loadedAt = parsePortalInstant(leg.origin.loadedAt ?? null);
  const originDeparture = parsePortalInstant(leg.origin.actualDeparture);
  const destinationArrival = parsePortalInstant(leg.destination.actualArrival);

  if (originArrival)
    out.push({ status: "at_origin", at: originArrival, eventType: "origin_arrived" });
  // The two loading steps (2026-08-16). The portal's API states them per stop and the TMS status
  // machine already had `loading`/`loaded` with nothing ever filling them — so a trip jumped from
  // "arrived at origin" to "in transit" and the two hours in between were invisible. `loading` has no
  // member in the event vocabulary (by design — it is a status_change, R6), so it carries no typed
  // event; `loaded` has one. The spreadsheet export states neither, and simply produces neither.
  if (loadingStarted) out.push({ status: "loading", at: loadingStarted, eventType: null });
  if (loadedAt) out.push({ status: "loaded", at: loadedAt, eventType: "loaded" });
  if (originDeparture)
    out.push({ status: "in_transit", at: originDeparture, eventType: "departed" });
  if (destinationArrival) {
    out.push({
      status: "at_destination",
      at: destinationArrival,
      eventType: "destination_arrived",
    });
  }
  // The unloading half, same story as loading: the API times it, and without it a trip arrived at
  // its destination and stayed there forever — outside the billing queue, and still generating
  // "unassigned" alerts weeks later. Breaking the seal IS the start of unloading.
  const unsealed = parsePortalInstant(leg.destination.unsealedAt ?? null);
  const unloaded = parsePortalInstant(leg.destination.unloadedAt ?? null);
  if (unsealed) out.push({ status: "unloading", at: unsealed, eventType: null });
  if (unloaded) out.push({ status: "unloaded", at: unloaded, eventType: "unloaded" });
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

  // Every milestone the trip has not reached yet, in lifecycle order. The walk goes THROUGH each of
  // them rather than straight to the furthest: the shortest path from `at_origin` to `in_transit` is
  // a single hop, so aiming at the furthest alone would silently drop `loading` and `loaded` — the
  // two steps whose whole point is that the hours between arriving and departing stop being invisible.
  const pending = [...timed.values()]
    .filter((m) => progressOf(m.status) > progressOf(current))
    .sort((a, b) => progressOf(a.status) - progressOf(b.status));
  if (pending.length === 0) return [];

  const hops: PlannedHop[] = [];
  let from = current;
  for (const milestone of pending) {
    const path = pathBetween(from, milestone.status);
    // Unreachable from here (the machine has no route): keep what is already proven and stop, rather
    // than losing the earlier milestones too.
    if (!path) break;
    for (const status of path) {
      const step = timed.get(status);
      hops.push({ status, at: step?.at ?? null, eventType: step?.eventType ?? null });
    }
    from = milestone.status;
  }
  return hops;
}
