import { eq } from "drizzle-orm";
import { TRANSITIONS, type TripStatus } from "@brazil-tms/shared";
import { db, tripEvents, trips, writeAudit } from "@brazil-tms/db";

/**
 * Closing a trip the CUSTOMER's file reports as finished or cancelled.
 *
 * Why this exists: the customer's schedule is cumulative — every week's file carries the whole
 * season, so thousands of rows describe trips that already ended. Left open in the TMS they sit in
 * the dispatch queue with a pickup in the past, and the SLA sweep rightly alerts on each one (a real
 * run produced ~8k alerts). The template's `closedStatusLabels` names those labels; this module is
 * what happens to the trips behind them.
 *
 * How it stays honest:
 *  - it walks only DECLARED transitions, never jumping straight to `completed`;
 *  - each hop is a `status_change` event sourced `import`, with a note saying it came from the
 *    customer's status — nobody can later read them as observed milestones;
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

/** Cancelled-like labels close as `cancelled`; anything else in the list closes as `completed`. */
function targetStatusFor(label: string): TripStatus {
  const v = fold(label);
  return v.includes("CANCEL") || v.includes("NO SHOW") || v.includes("INFRUTIFERA")
    ? "cancelled"
    : "completed";
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

export type CloseOutcome = "closed" | "already_closed" | "no_path";

/** Close `tripId` to match the customer's label. Idempotent: an already-terminal trip is left alone. */
export async function closeTripFromSource(
  tripId: string,
  label: string,
  actorUserId: string,
  sourceLabel: string,
): Promise<CloseOutcome> {
  const rows = await db
    .select({ status: trips.currentStatus, externalTripId: trips.externalTripId })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  const current = rows[0]?.status as TripStatus | undefined;
  if (!current) return "no_path";
  if (current === "completed" || current === "cancelled" || current === "billed") {
    return "already_closed";
  }

  const target = targetStatusFor(label);
  const hops = pathBetween(current, target);
  if (!hops || hops.length === 0) return "no_path";

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
        notes: `Encerrada na origem: status "${label}" em ${sourceLabel}.`,
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

  return "closed";
}
