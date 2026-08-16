import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { hopsToApply, milestonesFor, type PortalTrip, type TripStatus } from "@brazil-tms/shared";
import { db } from "../client";
import { locations, tripEvents, trips } from "../../schema";
import { writeAudit } from "../audit/write-audit";
import { recomputeTripSla } from "./sla";
import { markCompleted } from "./completion";
import { writePortalFacts } from "./portal-trip-facts";
import { linkFleetFromPortal } from "./portal-fleet-link";

/**
 * Writing the customer's portal execution onto trips the TMS already has (2026-08-16).
 *
 * The plan comes from the planning import; this only records WHAT HAPPENED — arrival, departure,
 * arrival at the destination — with the instants the customer's own system recorded. It is the step
 * that lets the trip timeline stop being a list of things people typed.
 *
 * Four rules, and each exists because the alternative is worse than doing nothing:
 *
 *  - IT NEVER CREATES A TRIP. A portal row for a trip the TMS does not know is reported, not
 *    invented: the plan (customer, lane, windows) belongs to the planning import, and a trip
 *    conjured from an execution row would have no plan to be measured against.
 *  - FORWARD ONLY. A trip already further along is left alone, so re-importing last week's export
 *    is a no-op instead of dragging trips backwards over work done here.
 *  - NO INVENTED TIMES. A hop the portal did not time (`confirmed`, on the way to `at_origin`)
 *    is written with a NULL timestamp. Only what the customer recorded carries an instant.
 *  - IDEMPOTENT PER EVENT. The same instant for the same trip and event is written once, so
 *    importing the same file twice does not double the timeline.
 */

export interface PortalApplyOutcome {
  externalTripId: string;
  legNumber: number;
  status:
    | "applied"
    | "not_found"
    | "already_ahead"
    | "no_milestones"
    | "unknown_station"
    | "closed"
    // The customer reported the trip finished and the TMS closed it — or could not, and says why.
    | "completed"
    | "completion_blocked";
  detail?: string;
  hops?: TripStatus[];
}

export interface PortalApplySummary {
  applied: number;
  notFound: number;
  alreadyAhead: number;
  noMilestones: number;
  unknownStation: number;
  closed: number;
  completed: number;
  completionBlocked: number;
  outcomes: PortalApplyOutcome[];
}

const TERMINAL = new Set<TripStatus>(["completed", "cancelled", "billed", "disputed"]);

/** The customer's station ids → the TMS locations they stand for, for one customer. */
export async function loadStationMap(customerId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: locations.id, externalStationId: locations.externalStationId })
    .from(locations)
    .where(and(eq(locations.customerId, customerId), isNull(locations.archivedAt)));
  const map = new Map<string, string>();
  for (const r of rows) if (r.externalStationId) map.set(r.externalStationId, r.id);
  return map;
}

/**
 * Apply one portal trip's legs. Each leg is matched to the TMS trip by (customer, external id, leg)
 * — the same key the planning import uses, so a milk run's second movement lands on its own trip.
 */
export async function applyPortalTrip(
  customerId: string,
  portal: PortalTrip,
  stationMap: Map<string, string>,
  actorUserId: string,
  sourceLabel: string,
): Promise<PortalApplyOutcome[]> {
  const out: PortalApplyOutcome[] = [];

  for (const leg of portal.legs) {
    const base = { externalTripId: portal.externalTripId, legNumber: leg.legNumber };

    // Both ends must be sites the TMS knows — an unresolved station means we cannot even be sure
    // this is the same movement.
    const originId = leg.origin.stationId ? stationMap.get(leg.origin.stationId) : undefined;
    const destinationId = leg.destination.stationId
      ? stationMap.get(leg.destination.stationId)
      : undefined;
    if (!originId || !destinationId) {
      out.push({
        ...base,
        status: "unknown_station",
        detail: !originId ? leg.origin.stationValue : leg.destination.stationValue,
      });
      continue;
    }

    const milestones = milestonesFor(leg);
    if (milestones.length === 0) {
      out.push({ ...base, status: "no_milestones" });
      continue;
    }

    const existing = (
      await db
        .select({
          id: trips.id,
          currentStatus: trips.currentStatus,
          customerFields: trips.customerFields,
          customerPriceCents: trips.customerPriceCents,
        })
        .from(trips)
        .where(
          and(
            eq(trips.customerId, customerId),
            eq(trips.externalTripId, portal.externalTripId),
            eq(trips.legNumber, leg.legNumber),
          ),
        )
        .limit(1)
    )[0];

    if (!existing) {
      out.push({ ...base, status: "not_found" });
      continue;
    }

    // Uma viagem encerrada não recebe mais nada: nem marco, nem motorista, nem vínculo.
    if (TERMINAL.has(existing.currentStatus as TripStatus)) {
      out.push({ ...base, status: "closed", detail: existing.currentStatus });
      continue;
    }

    /**
     * Quem está nesta viagem, ANTES de movê-la (2026-08-16).
     *
     * A ordem não é detalhe: `assignTrip` só aceita viagem em "Recebida", então aplicar os marcos
     * primeiro fecharia a porta do vínculo para sempre. E isto precisa acontecer aqui, não só no
     * plano, porque uma viagem some do Planejado assim que é aceita — a aba "Aceito" é execução, e é
     * onde as 73 viagens em curso viviam invisíveis, sem motorista e sem placa no TMS.
     *
     * Nada disso cria viagem: só preenche o que o cliente diz sobre uma que já existe.
     */
    await writePortalFacts(
      existing.id,
      portal,
      existing.customerFields,
      existing.customerPriceCents,
    );
    await linkFleetFromPortal(existing.id, portal, actorUserId);

    let reachedUnloaded = false;
    let tripId: string | null = null;
    const hops = hopsToApply(existing.currentStatus as TripStatus, milestones);
    if (hops.length === 0) {
      out.push({ ...base, status: "already_ahead", detail: existing.currentStatus });
      continue;
    }

    await db.transaction(async (tx) => {
      // Re-read under lock: between the read above and here, a dispatcher may have moved this trip.
      const locked = (
        await tx
          .select({ currentStatus: trips.currentStatus })
          .from(trips)
          .where(eq(trips.id, existing.id))
          .for("update")
          .limit(1)
      )[0]!;
      const from = locked.currentStatus as TripStatus;
      const fresh = hopsToApply(from, milestones);
      if (fresh.length === 0) {
        out.push({ ...base, status: "already_ahead", detail: from });
        return;
      }

      // Which (event type, instant) pairs this trip already carries — the idempotency guard that
      // makes re-importing the same export write nothing.
      const already = await tx
        .select({ eventType: tripEvents.eventType, eventTimestamp: tripEvents.eventTimestamp })
        .from(tripEvents)
        .where(eq(tripEvents.tripId, existing.id));
      const seen = new Set(
        already
          .filter((e) => e.eventTimestamp != null)
          .map((e) => `${e.eventType}@${e.eventTimestamp!.getTime()}`),
      );

      let before = from;
      const written: TripStatus[] = [];
      for (const hop of fresh) {
        await tx.insert(tripEvents).values({
          tripId: existing.id,
          eventType: "status_change",
          statusBefore: before,
          statusAfter: hop.status,
          eventTimestamp: hop.at,
          source: "import",
          actorUserId,
          notes: `Execução registrada pelo cliente (${sourceLabel}).`,
        });
        // The milestone event itself, with its real instant — skipped when already recorded.
        if (hop.eventType && hop.at && !seen.has(`${hop.eventType}@${hop.at.getTime()}`)) {
          await tx.insert(tripEvents).values({
            tripId: existing.id,
            eventType: hop.eventType,
            statusBefore: before,
            statusAfter: hop.status,
            eventTimestamp: hop.at,
            source: "import",
            actorUserId,
            notes: `Horário real informado pelo cliente (${sourceLabel}).`,
          });
        }
        before = hop.status;
        written.push(hop.status);
      }

      const target = written[written.length - 1]!;
      await tx
        .update(trips)
        .set({ currentStatus: target, updatedAt: new Date() })
        .where(eq(trips.id, existing.id));

      await writeAudit(tx, {
        entityType: "trip",
        entityId: existing.id,
        action: "trip.status_change",
        previousValue: { current_status: from },
        newValue: { current_status: target, hops: written },
        actorUserId,
        reason: `Execução do portal do cliente (${sourceLabel}).`,
      });

      await recomputeTripSla(tx, existing.id);
      out.push({ ...base, status: "applied", hops: written });
      reachedUnloaded = written[written.length - 1] === "unloaded";
      tripId = existing.id;
    });

    // The customer says the trip is over, and the TMS agrees it is unloaded: close it (2026-08-16).
    //
    // Left open, a trip sat at `at_destination` forever — on tmsdev that was 244 of them, each still
    // demanding a resource assignment weeks after it had been delivered, and NONE of them in the
    // billing queue. Completion is what puts a delivered trip in front of the money: `markCompleted`
    // runs the real gate (documents), advances to `billing_pending` and creates the billing item.
    // Nothing is invoiced by this — the next step (Billing Ready) needs pricing and stays human.
    //
    // Called outside the transaction because it opens its own, and never fatally: a trip that cannot
    // complete (a document missing, someone moved it meanwhile) is reported, and the rest go on.
    if (tripId && reachedUnloaded && isCompletedAtPortal(portal.status)) {
      try {
        await markCompleted(tripId, {}, actorUserId);
        out.push({ ...base, status: "completed" });
      } catch (error) {
        out.push({
          ...base,
          status: "completion_blocked",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return out;
}

/** The portal's own word for "this one ran to the end". Anything else is not a completion. */
function isCompletedAtPortal(status: string | null): boolean {
  return (status ?? "").trim().toLowerCase() === "completed";
}

/** Apply a whole export, trip by trip, and tally what happened. */
export async function applyPortalExecution(
  customerId: string,
  portalTrips: PortalTrip[],
  actorUserId: string,
  sourceLabel: string,
): Promise<PortalApplySummary> {
  const stationMap = await loadStationMap(customerId);
  const outcomes: PortalApplyOutcome[] = [];

  for (const portal of portalTrips) {
    outcomes.push(
      ...(await applyPortalTrip(customerId, portal, stationMap, actorUserId, sourceLabel)),
    );
  }

  const count = (s: PortalApplyOutcome["status"]): number =>
    outcomes.filter((o) => o.status === s).length;

  return {
    applied: count("applied"),
    notFound: count("not_found"),
    alreadyAhead: count("already_ahead"),
    noMilestones: count("no_milestones"),
    unknownStation: count("unknown_station"),
    closed: count("closed"),
    completed: count("completed"),
    completionBlocked: count("completion_blocked"),
    outcomes,
  };
}

/**
 * Teach the TMS which of its locations is which station in the customer's system — the one-time
 * reconciliation the execution import depends on. Keyed on the CODE both sides already agree on
 * (`SOC-RJ2`), which the portal's own API exposes next to its station id.
 */
export async function linkStationIds(
  customerId: string,
  pairs: { stationId: string; code: string }[],
): Promise<{ linked: number; unknownCode: string[] }> {
  const unknownCode: string[] = [];
  let linked = 0;

  for (const { stationId, code } of pairs) {
    const updated = await db
      .update(locations)
      .set({ externalStationId: stationId, updatedAt: new Date() })
      .where(
        and(
          eq(locations.customerId, customerId),
          eq(locations.code, code),
          // Never steal an id already pointing at another site; re-running is safe.
          sql`(${locations.externalStationId} IS NULL OR ${locations.externalStationId} = ${stationId})`,
        ),
      )
      .returning({ id: locations.id });
    if (updated.length === 0) unknownCode.push(code);
    else linked += 1;
  }

  return { linked, unknownCode };
}

/** Trips the TMS holds for these external ids — used by the import preview to report coverage. */
export async function existingTripIds(
  customerId: string,
  externalTripIds: string[],
): Promise<Set<string>> {
  if (externalTripIds.length === 0) return new Set();
  const rows = await db
    .select({ externalTripId: trips.externalTripId })
    .from(trips)
    .where(and(eq(trips.customerId, customerId), inArray(trips.externalTripId, externalTripIds)));
  return new Set(rows.map((r) => r.externalTripId).filter((v): v is string => v != null));
}
