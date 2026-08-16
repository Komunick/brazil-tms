import { and, eq } from "drizzle-orm";
import {
  normalizeVehicleType,
  parsePortalInstant,
  vehicleTypeSchema,
  type PortalLeg,
  type PortalTrip,
  type TripStatus,
  type VehicleType,
} from "@brazil-tms/shared";
import { db } from "../client";
import { trips } from "../../schema";
import { createTrip } from "./trips-service";
import { updateTripPlan } from "./trip-plan";
import { applyPortalTrip, loadStationMap, type PortalApplyOutcome } from "./portal-execution-apply";
import { closeTripFromSource } from "./source-status";

/**
 * The PLAN, taken from the customer's portal instead of a hand-typed spreadsheet (2026-08-16).
 *
 * Same export shape as the execution import — one row per stop — read for a different purpose: the
 * S columns (`STA`/`STD`) are what the customer INTENDS, so they become the trip's planned windows.
 * This is the half that lets the planning spreadsheet be switched off: every field it fed (id,
 * stations, windows, vehicle) comes from here, machine-written, with no `#N/D` and no two movements
 * stacked inside one cell.
 *
 * It is deliberately a SEPARATE act from the execution import, chosen by the operator, because the
 * two exports mean different things and only one of them may create a trip:
 *
 *   Planejado  → this: creates the trips (and updates the plan of the ones already here).
 *   Concluído  → the execution import: never creates, only records what happened.
 *
 * Running the plan import over a Concluído export would manufacture thousands of finished trips
 * nobody can act on — the exact flood the spreadsheet import already learned to avoid.
 */

export interface PortalPlanOutcome extends Omit<PortalApplyOutcome, "status"> {
  status: "created" | "updated" | "unchanged" | "cancelled" | "unknown_station" | "failed";
  detail?: string;
}

export interface PortalPlanSummary {
  created: number;
  updated: number;
  unchanged: number;
  cancelled: number;
  unknownStation: number;
  failed: number;
  /** Milestones applied on top, when the same file already carries real times. */
  milestones: number;
  outcomes: PortalPlanOutcome[];
}

/** The customer's word for a trip that was called off, in the portal's vocabulary. */
function isCancelledAtPortal(status: string | null): boolean {
  return (status ?? "").trim().toLowerCase() === "cancelled";
}

/**
 * The customer's word for the vehicle → the enum, or null. A label nobody recognizes leaves the
 * trip without a planned type rather than blocking the whole leg: the movement is real either way,
 * and an unmappable type is a data question, not a reason to lose the trip.
 */
function vehicleTypeFrom(label: string | null): VehicleType | null {
  if (!label) return null;
  const parsed = vehicleTypeSchema.safeParse(normalizeVehicleType(label));
  return parsed.success ? parsed.data : null;
}

/** The plan a leg states: both ends, the two windows, and the vehicle the customer asked for. */
function planFrom(leg: PortalLeg, vehicleLabel: string | null) {
  return {
    plannedPickupWindowStart: parsePortalInstant(leg.origin.plannedArrival),
    plannedPickupWindowEnd: parsePortalInstant(leg.origin.plannedDeparture),
    plannedDeliveryWindowStart: parsePortalInstant(leg.destination.plannedArrival),
    plannedDeliveryWindowEnd: parsePortalInstant(leg.destination.plannedDeparture),
    plannedVehicleType: vehicleTypeFrom(vehicleLabel),
  };
}

/** True when the stored plan already says exactly this — then the import writes nothing. */
function samePlan(
  current: {
    plannedPickupWindowStart: Date | null;
    plannedPickupWindowEnd: Date | null;
    plannedDeliveryWindowStart: Date | null;
    plannedDeliveryWindowEnd: Date | null;
    plannedVehicleType: string | null;
  },
  next: ReturnType<typeof planFrom>,
): boolean {
  const time = (d: Date | null): number | null => (d ? d.getTime() : null);
  return (
    time(current.plannedPickupWindowStart) === time(next.plannedPickupWindowStart) &&
    time(current.plannedPickupWindowEnd) === time(next.plannedPickupWindowEnd) &&
    time(current.plannedDeliveryWindowStart) === time(next.plannedDeliveryWindowStart) &&
    time(current.plannedDeliveryWindowEnd) === time(next.plannedDeliveryWindowEnd) &&
    (current.plannedVehicleType ?? null) === (next.plannedVehicleType ?? null)
  );
}

/**
 * Create or update the trips one portal trip states, then let the execution half record anything
 * the same file already proves. A trip the portal reports Cancelled is created and cancelled, so the
 * operation can still answer "why didn't this one run?" — the same call the spreadsheet import makes.
 */
export async function applyPortalPlanTrip(
  customerId: string,
  portal: PortalTrip,
  stationMap: Map<string, string>,
  actorUserId: string,
  sourceLabel: string,
): Promise<{ outcomes: PortalPlanOutcome[]; milestones: number }> {
  const outcomes: PortalPlanOutcome[] = [];

  for (const leg of portal.legs) {
    const base = { externalTripId: portal.externalTripId, legNumber: leg.legNumber };
    const originLocationId = leg.origin.stationId
      ? stationMap.get(leg.origin.stationId)
      : undefined;
    const destinationLocationId = leg.destination.stationId
      ? stationMap.get(leg.destination.stationId)
      : undefined;

    if (!originLocationId || !destinationLocationId) {
      outcomes.push({
        ...base,
        status: "unknown_station",
        detail: !originLocationId ? leg.origin.stationValue : leg.destination.stationValue,
      });
      continue;
    }

    const plan = planFrom(leg, portal.vehicleLabel);

    try {
      const existing = (
        await db
          .select()
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
        const created = await createTrip(
          {
            customerId,
            externalTripId: portal.externalTripId,
            legNumber: leg.legNumber,
            originLocationId,
            destinationLocationId,
            ...plan,
          },
          actorUserId,
        );
        if (isCancelledAtPortal(portal.status)) {
          await closeTripFromSource(created.id, "CANCELADA", actorUserId, sourceLabel);
          outcomes.push({ ...base, status: "cancelled" });
        } else {
          outcomes.push({ ...base, status: "created" });
        }
        continue;
      }

      // An existing trip keeps its status: the plan is updated, the lifecycle is not touched here.
      if (samePlan(existing, plan)) {
        outcomes.push({ ...base, status: "unchanged" });
        continue;
      }
      await updateTripPlan(existing.id, plan, { authorizedReview: false }, actorUserId);
      outcomes.push({ ...base, status: "updated" });
    } catch (error) {
      // One bad leg never costs the rest of the file — it is reported with its reason.
      outcomes.push({
        ...base,
        status: "failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Whatever the same file already proves about execution, recorded on top of the plan just written.
  const applied = await applyPortalTrip(customerId, portal, stationMap, actorUserId, sourceLabel);
  const milestones = applied.filter((o) => o.status === "applied").length;

  return { outcomes, milestones };
}

export async function applyPortalPlan(
  customerId: string,
  portalTrips: PortalTrip[],
  actorUserId: string,
  sourceLabel: string,
): Promise<PortalPlanSummary> {
  const stationMap = await loadStationMap(customerId);
  const outcomes: PortalPlanOutcome[] = [];
  let milestones = 0;

  for (const portal of portalTrips) {
    const result = await applyPortalPlanTrip(
      customerId,
      portal,
      stationMap,
      actorUserId,
      sourceLabel,
    );
    outcomes.push(...result.outcomes);
    milestones += result.milestones;
  }

  const count = (s: PortalPlanOutcome["status"]): number =>
    outcomes.filter((o) => o.status === s).length;

  return {
    created: count("created"),
    updated: count("updated"),
    unchanged: count("unchanged"),
    cancelled: count("cancelled"),
    unknownStation: count("unknown_station"),
    failed: count("failed"),
    milestones,
    outcomes,
  };
}

export type { TripStatus };
