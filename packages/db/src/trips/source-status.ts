import { and, eq, isNull } from "drizzle-orm";
import { TRANSITIONS, TRIP_STATUSES, type TripStatus } from "@brazil-tms/shared";
import { db } from "../client";
import { tripAssignments, tripEvents, trips } from "../../schema";
import { writeAudit } from "../audit/write-audit";

/**
 * Moving a trip to match the status the CUSTOMER's file reports.
 *
 * Two uses, one mechanism:
 *  - CLOSING (`closeTripFromSource`): the schedule is cumulative, so every week's file carries the
 *    whole season and thousands of rows describe trips that already ended. Left open they sit in the
 *    dispatch queue with a pickup in the past and the SLA sweep rightly alerts on each one.
 *  - ADVANCING (`advanceTripFromSource`, 2026-08-15): the same column also says where a RUNNING trip
 *    is. Reading it only to close left 54 trips showing "Atribuída" — and raising a missed-arrival
 *    alert — while the file said `EM VIAGEM` and the truck was on the road. The customer's words are
 *    translated by the `status_mappings` config (one engine, no per-customer code).
 *
 * How it stays honest, in both uses:
 *  - only DECLARED transitions are walked, never a jump straight to the target;
 *  - FORWARD ONLY. `assigned → received` is a legal transition (it is how an unassign is recorded),
 *    so a stale file would otherwise drag a trip backwards over work the team already did here. The
 *    file may move a trip ALONG the lifecycle, never back up it.
 *  - a trip is only advanced past `received` when it actually HAS a resource: a trip cannot honestly
 *    be `in_transit` with nobody driving it.
 *  - each hop is a `status_change` event sourced `import`, noting it came from the customer's status,
 *    so nobody can later read them as observed milestones;
 *  - `event_timestamp` stays NULL: the file records no real milestone times and we invent none;
 *  - one audit row per trip records the whole jump and the label that caused it.
 */

/** Accent-folded upper-case, so "INFRUTÍFERA" and "infrutifera" are the same label. */
const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

/** Does this row's status label mean "over" for this customer? */
export function isClosedAtSource(label: unknown, closedLabels: string[]): boolean {
  if (label == null || String(label).trim() === "" || closedLabels.length === 0) return false;
  const wanted = new Set(closedLabels.map(fold));
  return wanted.has(fold(String(label)));
}

/**
 * Does this label mean the trip was CALLED OFF (as opposed to run to the end)? The distinction
 * decides more than the target status: a trip the customer cancelled is imported and cancelled so
 * the operation keeps the record ("por que essa não rodou?"), while one that simply finished long
 * ago is skipped — the TMS gains nothing from thousands of historical deliveries.
 */
export function isCancellationLabel(label: unknown): boolean {
  const v = fold(String(label ?? ""));
  return v.includes("CANCEL") || v.includes("NO SHOW") || v.includes("INFRUTIFERA");
}

/** Cancelled-like labels close as `cancelled`; anything else in the list closes as `completed`. */
function targetStatusFor(label: string): TripStatus {
  return isCancellationLabel(label) ? "cancelled" : "completed";
}

/**
 * Shortest path of DECLARED transitions from `from` to `to`. `cancelled` is terminal, so it is only
 * ever the destination, never a step along the way.
 */
function pathBetween(from: TripStatus, to: TripStatus): TripStatus[] | null {
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

/**
 * `TRIP_STATUSES` is declared in lifecycle order, so position IS progress for the operational
 * stretch. `cancelled`/`disputed` sit outside that line and are never advance targets.
 */
function progressOf(status: TripStatus): number {
  return TRIP_STATUSES.indexOf(status);
}

const TERMINAL = new Set<TripStatus>(["completed", "cancelled", "billed"]);

async function hasActiveResource(tripId: string): Promise<boolean> {
  const rows = await db
    .select({ id: tripAssignments.id })
    .from(tripAssignments)
    .where(and(eq(tripAssignments.tripId, tripId), isNull(tripAssignments.supersededAt)))
    .limit(1);
  return rows.length > 0;
}

/** The one writer: walk `hops`, recording each as an import-sourced event, then one audit row. */
async function walkFromSource(
  tripId: string,
  current: TripStatus,
  target: TripStatus,
  hops: TripStatus[],
  label: string,
  actorUserId: string,
  sourceLabel: string,
  note: string,
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    let before: TripStatus = current;
    const events = hops.map((after) => {
      const event = {
        tripId,
        eventType: "status_change" as const,
        statusBefore: before,
        statusAfter: after,
        eventTimestamp: null,
        source: "import" as const,
        actorUserId,
        notes: note,
      };
      before = after;
      return event;
    });
    await tx.insert(tripEvents).values(events);

    await tx
      .update(trips)
      .set({
        currentStatus: target,
        updatedAt: now,
        ...(target === "cancelled"
          ? {
              cancelledAt: now,
              cancellationReasonCode: fold(label).replace(/\s+/g, "_"),
              cancellationResponsibleParty: "customer_caused" as const,
              cancellationBillingImpact: "not_billable",
            }
          : {}),
      })
      .where(eq(trips.id, tripId));

    await writeAudit(tx, {
      entityType: "trip",
      entityId: tripId,
      action: "trip.status_change",
      previousValue: { current_status: current },
      newValue: { current_status: target, hops },
      actorUserId,
      reason: `Importação: o cliente reporta "${label}" (${sourceLabel}).`,
    });
  });
}

export type CloseOutcome = "closed" | "already_closed" | "no_path";

/** Close `tripId` to match the customer's label. Idempotent: an already-terminal trip is left alone. */
export async function closeTripFromSource(
  tripId: string,
  label: string,
  actorUserId: string,
  sourceLabel: string,
): Promise<CloseOutcome> {
  const rows = await db
    .select({ status: trips.currentStatus })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  const current = rows[0]?.status as TripStatus | undefined;
  if (!current) return "no_path";
  if (TERMINAL.has(current)) return "already_closed";

  const target = targetStatusFor(label);
  const hops = pathBetween(current, target);
  if (!hops || hops.length === 0) return "no_path";

  await walkFromSource(
    tripId,
    current,
    target,
    hops,
    label,
    actorUserId,
    sourceLabel,
    `Encerrada na origem: status "${label}" em ${sourceLabel}.`,
  );
  return "closed";
}

export type AdvanceOutcome =
  | "advanced"
  | "already_there"
  | "backwards" // the file is behind the TMS — the team here knows more
  | "no_resource" // cannot be underway with nobody driving it
  | "terminal"
  | "no_path";

/**
 * Move `tripId` FORWARD to the status the customer's label denotes (`status_mappings`). Every
 * refusal is a named outcome so the confirm can report how many rows the file could not move and
 * why, instead of silently doing nothing.
 */
export async function advanceTripFromSource(
  tripId: string,
  target: TripStatus,
  label: string,
  actorUserId: string,
  sourceLabel: string,
): Promise<AdvanceOutcome> {
  const rows = await db
    .select({ status: trips.currentStatus })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  const current = rows[0]?.status as TripStatus | undefined;
  if (!current) return "no_path";
  if (TERMINAL.has(current) || current === "disputed") return "terminal";
  if (current === target) return "already_there";
  if (progressOf(target) <= progressOf(current)) return "backwards";
  if (target !== "received" && !(await hasActiveResource(tripId))) return "no_resource";

  const hops = pathBetween(current, target);
  if (!hops || hops.length === 0) return "no_path";

  await walkFromSource(
    tripId,
    current,
    target,
    hops,
    label,
    actorUserId,
    sourceLabel,
    `Status do cliente: "${label}" em ${sourceLabel}.`,
  );
  return "advanced";
}
