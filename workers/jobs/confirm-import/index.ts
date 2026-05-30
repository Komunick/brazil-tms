import type { PgBoss } from "pg-boss";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  Conflict,
  createTrip,
  db,
  importBatches,
  importRows,
  trips,
  updateTripPlan,
  writeAudit,
} from "@brazil-tms/db";
import {
  createTripSchema,
  type ConfirmPayload,
  type TripPlanFields,
} from "@brazil-tms/shared";
import { setBatchCounts, setBatchStatus } from "../../lib/batch-progress";
import { JOB, work } from "../../lib/queue";

/**
 * T033 — `import.confirm` job (data-model R8; contract §C/§A). Per row best-effort + idempotent: for
 * each `valid`/`warning` row with `applied_at IS NULL`, call the PROMOTED 003 trip-write services
 * (`createTrip`/`updateTripPlan`) — never re-implementing trip creation, the status machine, or the
 * audit. Imported trips land in `received` (the service default); import never transitions status.
 *
 * IDEMPOTENCY: a row's `applied_at`/`target_trip_id` guard makes a re-run skip already-applied rows,
 * so re-running creates 0 new trips. The trips partial unique index `(customer_id, external_trip_id)`
 * is the race backstop: a `new` row that loses the race to a 23505 is RE-RESOLVED as update.
 *
 * A per-row failure is recorded (reason appended) and does NOT abort the batch.
 */

const PG_UNIQUE_VIOLATION = "23505";

/** Walk the Drizzle error cause chain for a Postgres unique-violation (SQLSTATE 23505). */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      (current as { code?: unknown }).code === PG_UNIQUE_VIOLATION
    ) {
      return true;
    }
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return false;
}

/** The plan-only subset of the parsed create input (what `updateTripPlan` accepts). */
function planChangesFrom(
  input: ReturnType<typeof createTripSchema.parse>,
): TripPlanFields {
  return {
    plannedPickupWindowStart: input.plannedPickupWindowStart ?? null,
    plannedPickupWindowEnd: input.plannedPickupWindowEnd ?? null,
    plannedDeliveryWindowStart: input.plannedDeliveryWindowStart ?? null,
    plannedDeliveryWindowEnd: input.plannedDeliveryWindowEnd ?? null,
    plannedVehicleType: input.plannedVehicleType ?? null,
    plannedVolumeUnits: input.plannedVolumeUnits ?? null,
    plannedWeightKg: input.plannedWeightKg ?? null,
    plannedPalletCount: input.plannedPalletCount ?? null,
    plannedRouteNotes: input.plannedRouteNotes ?? null,
    plannedServiceRequirements: input.plannedServiceRequirements ?? null,
  };
}

/** Find an existing trip by the match key (customer, external_trip_id); null when absent. */
async function findExistingTrip(
  customerId: string,
  externalTripId: string,
): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.customerId, customerId), eq(trips.externalTripId, externalTripId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function runConfirm(payload: ConfirmPayload): Promise<void> {
  const { batchId, actorUserId } = payload;
  await setBatchStatus(batchId, "confirming");

  const batchRows = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);
  const batch = batchRows[0];
  if (!batch) return;

  const pending = await db
    .select()
    .from(importRows)
    .where(
      and(
        eq(importRows.importBatchId, batchId),
        inArray(importRows.outcome, ["valid", "warning"]),
      ),
    )
    .orderBy(asc(importRows.rowNumber));

  for (const row of pending) {
    if (row.appliedAt != null) continue; // idempotency guard: already applied

    const mapped = (row.mapped ?? {}) as Record<string, unknown>;
    let targetTripId: string | null = null;

    try {
      const input = createTripSchema.parse({
        customerId: batch.customerId,
        externalTripId: mapped.externalTripId ?? null,
        importBatchId: batchId,
        originLocationId: mapped.originLocationId,
        destinationLocationId: mapped.destinationLocationId,
        plannedPickupWindowStart: mapped.plannedPickupWindowStart ?? null,
        plannedPickupWindowEnd: mapped.plannedPickupWindowEnd ?? null,
        plannedDeliveryWindowStart: mapped.plannedDeliveryWindowStart ?? null,
        plannedDeliveryWindowEnd: mapped.plannedDeliveryWindowEnd ?? null,
        plannedVehicleType: mapped.plannedVehicleType ?? null,
        plannedVolumeUnits: mapped.plannedVolumeUnits ?? null,
        plannedWeightKg: mapped.plannedWeightKg ?? null,
        plannedPalletCount: mapped.plannedPalletCount ?? null,
        plannedRouteNotes: mapped.plannedRouteNotes ?? null,
        plannedServiceRequirements: mapped.plannedServiceRequirements ?? null,
      });
      const planChanges = planChangesFrom(input);
      const externalTripId = input.externalTripId ?? "";

      if (row.matchDecision === "new") {
        try {
          const trip = await createTrip(input, actorUserId);
          targetTripId = trip.id;
        } catch (err) {
          // Race backstop: a concurrent insert won the partial-unique index → re-resolve as update.
          if (isUniqueViolation(err) && externalTripId) {
            const existing = await findExistingTrip(batch.customerId, externalTripId);
            if (!existing) throw err;
            await updateTripPlan(existing.id, planChanges, {}, actorUserId);
            targetTripId = existing.id;
          } else {
            throw err;
          }
        }
      } else if (row.matchDecision === "update") {
        const existing = externalTripId
          ? await findExistingTrip(batch.customerId, externalTripId)
          : null;
        if (existing) {
          await updateTripPlan(existing.id, planChanges, {}, actorUserId);
          targetTripId = existing.id;
        } else {
          // The matched trip vanished between detection and confirm → create it.
          const trip = await createTrip(input, actorUserId);
          targetTripId = trip.id;
        }
      } else if (row.matchDecision === "no_op") {
        const existing = externalTripId
          ? await findExistingTrip(batch.customerId, externalTripId)
          : null;
        targetTripId = existing?.id ?? null;
      }

      await db
        .update(importRows)
        .set({ targetTripId, appliedAt: new Date() })
        .where(eq(importRows.id, row.id));
    } catch (err) {
      // Per-row failure: record (e.g. REVIEW_REQUIRED → needs-review) and continue (don't abort batch).
      const code = err instanceof Conflict ? err.code : "APPLY_FAILED";
      const existingReasons = Array.isArray(row.reasons)
        ? (row.reasons as { code: string; field?: string; message: string }[])
        : [];
      await db
        .update(importRows)
        .set({
          reasons: [
            ...existingReasons,
            { code, message: `Falha ao aplicar a linha: ${(err as Error).message}` },
          ],
        })
        .where(eq(importRows.id, row.id));
    }
  }

  // Recompute the applied tallies from the rows themselves (idempotent across re-runs): a row that
  // resulted in a NEW trip has no prior trip; an UPDATE row targeted an existing one. We count by the
  // match decision among applied rows so totals reflect this run + any prior partial runs.
  const applied = await db
    .select({ matchDecision: importRows.matchDecision })
    .from(importRows)
    .where(and(eq(importRows.importBatchId, batchId), isNotNull(importRows.appliedAt)))
    .orderBy(asc(importRows.rowNumber));

  const createdCount = applied.filter((r) => r.matchDecision === "new").length;
  const updatedCount = applied.filter((r) => r.matchDecision === "update").length;
  const errorRows = await db
    .select({ id: importRows.id })
    .from(importRows)
    .where(and(eq(importRows.importBatchId, batchId), eq(importRows.outcome, "error")));
  const errorCount = errorRows.length;

  await setBatchCounts(batchId, { createdCount, updatedCount, errorCount });
  await setBatchStatus(batchId, "completed");

  // Audit the confirm at the batch level. `db` satisfies the writeAudit `Inserter` (Pick<DB,"insert">).
  await writeAudit(db, {
    entityType: "import_batch",
    entityId: batchId,
    action: "import.confirm",
    previousValue: null,
    newValue: { createdCount, updatedCount, errorCount },
    actorUserId,
  });
}

export async function registerConfirm(boss: PgBoss): Promise<void> {
  await work(boss, JOB.confirm, async (payload) => {
    await runConfirm(payload);
  });
}
