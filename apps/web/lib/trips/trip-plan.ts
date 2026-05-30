import "server-only";
import { eq } from "drizzle-orm";
import { db, trips } from "@brazil-tms/db";
import { TRIP_CRITICAL_FIELDS, TRIP_STATUSES, type TripPlanFields } from "@brazil-tms/shared";
import { writeAudit } from "@/lib/audit/write-audit";
import { Conflict } from "@/lib/api/respond";
import { loadTripDetail, type TripDetail } from "@/lib/trips/trip-dto";

/**
 * Plan-update service (US1; FR-005, FR-016). Applies an accepted customer update to the live
 * `planned_*` columns — the CURRENT plan (R4/R5). The immutable `original_plan` snapshot is NEVER
 * touched here. A `trip.plan_update` audit row is written only when a CHANGED field is in the
 * documented critical-field set (R9, FR-016); a non-critical-only edit writes no audit. Edits after
 * `confirmed` require an authorized review (FR-005).
 */

/** The 10 live, updatable planned fields (mirrors `tripPlanFieldsSchema`; `original_plan` excluded). */
const PLAN_FIELDS = [
  "plannedPickupWindowStart",
  "plannedPickupWindowEnd",
  "plannedDeliveryWindowStart",
  "plannedDeliveryWindowEnd",
  "plannedVehicleType",
  "plannedVolumeUnits",
  "plannedWeightKg",
  "plannedPalletCount",
  "plannedRouteNotes",
  "plannedServiceRequirements",
] as const satisfies readonly (keyof TripPlanFields)[];

const CRITICAL = new Set<string>(TRIP_CRITICAL_FIELDS);

/** Strict-equal, treating two Dates with the same instant as equal (timestamps compare by value). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

export async function updateTripPlan(
  tripId: string,
  changes: TripPlanFields,
  args: { authorizedReview?: boolean },
  actorUserId: string,
): Promise<TripDetail> {
  const currentRows = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  const current = currentRows[0];
  if (!current) throw new Conflict("NOT_FOUND", "Viagem não encontrada.");

  // Post-confirmed review gate (FR-005): once the trip is past `confirmed` in lifecycle order, an
  // edit requires an explicit authorized review.
  const pastConfirmed =
    TRIP_STATUSES.indexOf(current.currentStatus) > TRIP_STATUSES.indexOf("confirmed");
  if (pastConfirmed && !args.authorizedReview) {
    throw new Conflict("REVIEW_REQUIRED", "Edições após a confirmação exigem revisão autorizada.");
  }

  // Provided fields = the planned keys explicitly present (undefined = untouched; null = clear).
  const provided = PLAN_FIELDS.filter((field) => changes[field] !== undefined);

  const set: Record<string, unknown> = { updatedAt: new Date() };
  const previousValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  const currentRow = current as Record<string, unknown>;

  for (const field of provided) {
    const next = changes[field] ?? null;
    set[field] = next;
    // A critical change = a provided critical field whose new value differs from the stored one.
    if (CRITICAL.has(field) && !sameValue(currentRow[field], next)) {
      previousValue[field] = currentRow[field] ?? null;
      newValue[field] = next;
    }
  }

  const criticalChanged = Object.keys(newValue).length > 0;

  return db.transaction(async (tx) => {
    await tx.update(trips).set(set).where(eq(trips.id, tripId));

    if (criticalChanged) {
      await writeAudit(tx, {
        entityType: "trip",
        entityId: tripId,
        action: "trip.plan_update",
        previousValue,
        newValue,
        actorUserId,
      });
    }

    const detail = await loadTripDetail(tx, tripId);
    if (!detail) throw new Conflict("NOT_FOUND", "Viagem não encontrada.");
    return detail;
  });
}
