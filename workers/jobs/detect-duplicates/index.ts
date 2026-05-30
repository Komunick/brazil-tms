import type { PgBoss } from "pg-boss";
import { and, asc, eq } from "drizzle-orm";
import { db, importBatches, importRows, trips } from "@brazil-tms/db";
import type { DetectDuplicatesPayload } from "@brazil-tms/shared";
import { setBatchCounts, setBatchStatus } from "../../lib/batch-progress";
import { JOB, work } from "../../lib/queue";

/**
 * T032 — `import.detect-duplicates` job (CORE exact match only; data-model R7; contract §C). For each
 * non-error row, key on `(customer_id, external_trip_id)` against existing `trips`:
 *   - no match            → `new`
 *   - match, plan differs  → `update`
 *   - match, identical     → `no_op`
 * A repeated external id is NEVER a blocking duplicate (FR-021). Error rows get `unresolved`.
 *
 * Out of scope for US1 (later slices): fuzzy `potential_duplicate` (US3), in-file collision → error
 * (US2/US3), and enqueuing `generate-error-report` (US2). So `duplicateCount` is 0 here.
 *
 * The "differs" comparison is a documented SHALLOW compare of the planned fields the confirm stage
 * would pass to `updateTripPlan` (windows, vehicle type, counts, route notes) — value-equal by
 * instant for timestamps, strict-equal otherwise. JSON service-requirements are compared structurally.
 */

/** The planned fields confirm would write — the diff surface for new/update/no_op. */
const PLAN_COMPARE_FIELDS = [
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
] as const;

type TripRow = typeof trips.$inferSelect;

function toMillis(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

const DATE_FIELDS = new Set<string>([
  "plannedPickupWindowStart",
  "plannedPickupWindowEnd",
  "plannedDeliveryWindowStart",
  "plannedDeliveryWindowEnd",
]);

/** True when the mapped row's planned value for `field` differs from the trip's current value. */
function fieldDiffers(field: string, mapped: Record<string, unknown>, trip: TripRow): boolean {
  const mappedValue = mapped[field] ?? null;
  const tripValue = (trip as unknown as Record<string, unknown>)[field] ?? null;

  if (DATE_FIELDS.has(field)) {
    return toMillis(mappedValue) !== toMillis(tripValue);
  }
  if (field === "plannedServiceRequirements") {
    return JSON.stringify(mappedValue) !== JSON.stringify(tripValue);
  }
  return mappedValue !== tripValue;
}

export async function runDetectDuplicates(payload: DetectDuplicatesPayload): Promise<void> {
  const { batchId } = payload;

  const batchRows = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);
  const batch = batchRows[0];
  if (!batch) return;

  const rows = await db
    .select()
    .from(importRows)
    .where(eq(importRows.importBatchId, batchId))
    .orderBy(asc(importRows.rowNumber));

  let createdCount = 0;
  let updatedCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    if (row.outcome === "error") {
      errorCount += 1;
      await db
        .update(importRows)
        .set({ matchDecision: "unresolved" })
        .where(eq(importRows.id, row.id));
      continue;
    }

    const mapped = (row.mapped ?? {}) as Record<string, unknown>;
    const externalTripId = mapped.externalTripId;

    let decision: "new" | "update" | "no_op";
    if (externalTripId == null || String(externalTripId).trim() === "") {
      // Should not reach here (validate flags missing id as error), but guard defensively.
      decision = "new";
    } else {
      const existing = await db
        .select()
        .from(trips)
        .where(
          and(
            eq(trips.customerId, batch.customerId),
            eq(trips.externalTripId, String(externalTripId)),
          ),
        )
        .limit(1);
      const trip = existing[0];
      if (!trip) {
        decision = "new";
      } else {
        const differs = PLAN_COMPARE_FIELDS.some((f) => fieldDiffers(f, mapped, trip));
        decision = differs ? "update" : "no_op";
      }
    }

    if (decision === "new") createdCount += 1;
    else if (decision === "update") updatedCount += 1;

    await db
      .update(importRows)
      .set({ matchDecision: decision })
      .where(eq(importRows.id, row.id));
  }

  await setBatchCounts(batchId, {
    createdCount,
    updatedCount,
    duplicateCount: 0, // fuzzy duplicates are US3
    errorCount,
  });
  await setBatchStatus(batchId, "validated");
}

export async function registerDetectDuplicates(boss: PgBoss): Promise<void> {
  await work(boss, JOB.detectDuplicates, async (payload) => {
    await runDetectDuplicates(payload);
    // US2 enqueues `generate-error-report` here when error_count > 0; out of scope for US1.
  });
}
