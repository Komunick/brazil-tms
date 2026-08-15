import type { PgBoss } from "pg-boss";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  Conflict,
  createTrip,
  db,
  importBatches,
  importRows,
  importTemplates,
  trips,
  updateTripPlan,
  writeAudit,
} from "@brazil-tms/db";
import { createTripSchema, type ConfirmPayload, type TripPlanFields } from "@brazil-tms/shared";
import { setBatchCounts, setBatchStatus } from "../../lib/batch-progress";
import { JOB, work } from "../../lib/queue";
import { runGenerateErrorReport } from "../generate-error-report";
import {
  buildResourceIndex,
  hasResourceRequest,
  linkResources,
  resourceRequestFrom,
  type ResourceIndex,
} from "./resources";
import { closeTripFromSource, isClosedAtSource } from "./close-at-source";

/**
 * T033 — `import.confirm` job (data-model R8; contract §C/§A). Per row best-effort + idempotent: for
 * each `valid`/`warning` row with `applied_at IS NULL`, call the PROMOTED 003 trip-write services
 * (`createTrip`/`updateTripPlan`) — never re-implementing trip creation, the status machine, or the
 * audit. Newly created trips are born `received` (slice 015, superseding slice 014's born-`validated`):
 * the validation states were collapsed into `received`, which is itself the first dispatchable status,
 * so a passing imported row is a `received` trip — `createTrip` is called with no status argument. Import
 * never changes an EXISTING trip's status: the `updateTripPlan` paths (update + unique-race fallback)
 * and `no_op` are status-neutral, so an already-`assigned`/`in_transit` trip keeps its status (FR-002).
 *
 * IDEMPOTENCY: a row's `applied_at`/`target_trip_id` guard makes a re-run skip already-applied rows,
 * so re-running creates 0 new trips. The trips partial unique index `(customer_id, external_trip_id)`
 * is the race backstop: a `new` row that loses the race to a 23505 is RE-RESOLVED as update.
 *
 * US3 (T046): a `potential_duplicate` row is a `warning` that IS applied — it had no external-id match,
 * so it creates a NEW trip (treated exactly like `new`), carrying its already-recorded POTENTIAL_DUPLICATE
 * reason on the import row (FR-022; it is NOT skipped). An `update` to a trip moved PAST `confirmed`
 * surfaces `Conflict('REVIEW_REQUIRED')` from `updateTripPlan`: that row is marked NEEDS-REVIEW (reason
 * appended, `applied_at`/`target_trip_id` left NULL — reported, not dropped, not silently applied,
 * FR-024) and the batch continues.
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
function planChangesFrom(input: ReturnType<typeof createTripSchema.parse>): TripPlanFields {
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

/**
 * Find an existing trip by the match key (customer, external_trip_id, leg); null when absent.
 * The leg keeps a milk run's second movement from overwriting its first — they share the customer's
 * id on purpose.
 */
async function findExistingTrip(
  customerId: string,
  externalTripId: string,
  legNumber = 1,
): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: trips.id })
    .from(trips)
    .where(
      and(
        eq(trips.customerId, customerId),
        eq(trips.externalTripId, externalTripId),
        eq(trips.legNumber, legNumber),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Collect the `customer.<rótulo>` targets the engine stored on the mapped row into the jsonb bag
 * kept on the trip. Returns null when the template maps none, so trips from other customers keep a
 * null column instead of an empty object.
 */
function customerFieldsFrom(mapped: Record<string, unknown>): Record<string, string> | null {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(mapped)) {
    if (!key.startsWith("customer.")) continue;
    if (value === null || value === undefined || String(value).trim() === "") continue;
    fields[key.slice("customer.".length)] = String(value).trim();
  }
  return Object.keys(fields).length ? fields : null;
}

/** The template's `closedStatusLabels`, or none when the batch used the built-in standard format. */
async function closedStatusLabelsFor(templateId: string | null): Promise<string[]> {
  if (!templateId) return [];
  const rows = await db
    .select({ config: importTemplates.closedStatusLabels })
    .from(importTemplates)
    .where(eq(importTemplates.id, templateId))
    .limit(1);
  const value = rows[0]?.config;
  return Array.isArray(value) ? (value as string[]) : [];
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
      and(eq(importRows.importBatchId, batchId), inArray(importRows.outcome, ["valid", "warning"])),
    )
    .orderBy(asc(importRows.rowNumber));

  // Registry snapshot for the resource linking below — read once, not per row.
  const needsResources = pending.some((row) =>
    hasResourceRequest(resourceRequestFrom((row.mapped ?? {}) as Record<string, unknown>)),
  );
  const resourceIndex: ResourceIndex | null = needsResources ? await buildResourceIndex() : null;
  const linkTally = { assigned: 0, blocked: 0, unresolved: 0 };

  // The customer's "this is over" labels, from the template. Empty → status is ignored, which is the
  // behaviour every other customer keeps.
  const closedLabels = await closedStatusLabelsFor(batch.templateId);
  const closedTally = { skipped: 0, closed: 0 };

  /**
   * Live progress. Confirming a real customer file means thousands of rows, each one a trip write
   * plus an eligibility-checked assignment — minutes of work. Publishing the running tallies every
   * `PROGRESS_EVERY` rows lets the screen show movement instead of a frozen "confirmando"; the
   * authoritative recount still happens at the end.
   */
  const PROGRESS_EVERY = 50;
  let appliedNew = 0;
  let appliedUpdated = 0;
  let processed = 0;

  for (const row of pending) {
    if (row.appliedAt != null) continue; // idempotency guard: already applied

    const mapped = (row.mapped ?? {}) as Record<string, unknown>;
    let targetTripId: string | null = null;

    try {
      // Which leg of the customer's programming this row is (detect-duplicates stamped it).
      const legNumber = typeof mapped.legNumber === "number" ? mapped.legNumber : 1;

      /**
       * The row says the trip is already over. Two halves, and both are needed:
       *  - the TMS does not know it → SKIP. Creating it would put a finished trip in the dispatch
       *    queue with a pickup in the past, which is exactly what floods the SLA alerts;
       *  - the TMS already has it (imported last week, still open here) → CLOSE it to match, so it
       *    stops being an open trip forever.
       */
      if (isClosedAtSource(mapped.statusLabel, closedLabels)) {
        const externalId = mapped.externalTripId ? String(mapped.externalTripId) : "";
        const existing = externalId
          ? await findExistingTrip(batch.customerId, externalId, legNumber)
          : null;
        const label = String(mapped.statusLabel);

        if (existing) {
          const outcome = await closeTripFromSource(
            existing.id,
            label,
            actorUserId,
            batch.fileName,
          );
          if (outcome === "closed") closedTally.closed++;
          targetTripId = existing.id;
        } else {
          closedTally.skipped++;
        }

        const priorReasons = Array.isArray(row.reasons)
          ? (row.reasons as { code: string; field?: string; message: string }[])
          : [];
        await db
          .update(importRows)
          .set({
            targetTripId,
            appliedAt: new Date(),
            reasons: [
              ...priorReasons,
              {
                code: "CLOSED_AT_SOURCE",
                message: existing
                  ? `O cliente reporta "${label}": viagem encerrada no TMS.`
                  : `O cliente reporta "${label}": linha não importada (viagem já encerrada na origem).`,
              },
            ],
          })
          .where(eq(importRows.id, row.id));
        continue;
      }
      const input = createTripSchema.parse({
        customerId: batch.customerId,
        externalTripId: mapped.externalTripId ?? null,
        legNumber,
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

      if (row.matchDecision === "new" || row.matchDecision === "potential_duplicate") {
        // A potential_duplicate had NO external-id match → it creates a NEW trip, exactly like `new`.
        // Its POTENTIAL_DUPLICATE reason already lives on the import row; we do not drop or skip it.
        try {
          // Born received (slice 015): a passing imported row is a `received` trip, immediately
          // dispatchable (`received → assigned`) — the separate validate hop was collapsed away.
          const trip = await createTrip(input, actorUserId);
          targetTripId = trip.id;
        } catch (err) {
          // Race backstop: a concurrent insert won the partial-unique index → re-resolve as update.
          if (isUniqueViolation(err) && externalTripId) {
            const existing = await findExistingTrip(batch.customerId, externalTripId, legNumber);
            if (!existing) throw err;
            await updateTripPlan(existing.id, planChanges, {}, actorUserId);
            targetTripId = existing.id;
          } else {
            throw err;
          }
        }
      } else if (row.matchDecision === "update") {
        const existing = externalTripId
          ? await findExistingTrip(batch.customerId, externalTripId, legNumber)
          : null;
        if (existing) {
          await updateTripPlan(existing.id, planChanges, {}, actorUserId);
          targetTripId = existing.id;
        } else {
          // The matched trip vanished between detection and confirm → create it (born received, slice 015).
          const trip = await createTrip(input, actorUserId);
          targetTripId = trip.id;
        }
      } else if (row.matchDecision === "no_op") {
        const existing = externalTripId
          ? await findExistingTrip(batch.customerId, externalTripId, legNumber)
          : null;
        targetTripId = existing?.id ?? null;
      }

      // The columns the customer's file carries that the TMS has no field for (região, solicitação,
      // CT-e…) ride along on the trip so they show on its screen — display-only, no migration per
      // column. Written after the plan write so it applies to created and updated trips alike.
      const customerFields = customerFieldsFrom(mapped);
      if (targetTripId && customerFields) {
        await db
          .update(trips)
          .set({ customerFields, updatedAt: new Date() })
          .where(eq(trips.id, targetTripId));
      }

      // Link the resources the schedule already names (driver / tractor / trailer). Never fatal to
      // the row: the trip exists either way, and what could not be linked is reported.
      const outcome =
        targetTripId && resourceIndex
          ? await linkResources(
              targetTripId,
              resourceRequestFrom(mapped),
              resourceIndex,
              actorUserId,
              batch.fileName,
            )
          : null;
      if (outcome?.status === "assigned") linkTally.assigned++;
      if (outcome?.status === "blocked" || outcome?.status === "unresolved") {
        if (outcome.status === "blocked") linkTally.blocked++;
        else linkTally.unresolved++;
        const priorReasons = Array.isArray(row.reasons)
          ? (row.reasons as { code: string; field?: string; message: string }[])
          : [];
        await db
          .update(importRows)
          .set({
            reasons: [
              ...priorReasons,
              outcome.status === "blocked"
                ? {
                    code: "ASSIGNMENT_BLOCKED",
                    message: `Recursos não vinculados: ${outcome.detail}`,
                  }
                : {
                    code: "RESOURCE_NOT_FOUND",
                    message: `Recursos não vinculados — sem cadastro: ${outcome.missing.join(", ")}.`,
                  },
            ],
          })
          .where(eq(importRows.id, row.id));
      }

      await db
        .update(importRows)
        .set({ targetTripId, appliedAt: new Date() })
        .where(eq(importRows.id, row.id));

      if (row.matchDecision === "new" || row.matchDecision === "potential_duplicate") appliedNew++;
      else if (row.matchDecision === "update") appliedUpdated++;
      processed++;
      if (processed % PROGRESS_EVERY === 0) {
        await setBatchCounts(batchId, {
          createdCount: appliedNew,
          updatedCount: appliedUpdated,
          errorCount: batch.errorCount,
        });
      }
    } catch (err) {
      // Per-row failure: record + continue (never abort the batch). Two distinct kinds:
      //  - REVIEW_REQUIRED (the trip is past `confirmed`): TERMINAL for import — a re-run hits the same
      //    gate (import never passes `authorizedReview`), so retrying is futile. Mark it `error` so it
      //    is counted, shown, and included in the regenerated report (FR-024), and NOT retried.
      //  - any other (unexpected/transient) failure: keep the row's `outcome` (valid/warning) and leave
      //    `applied_at` NULL so a RE-CONFIRM retries it (R8 idempotency). The reason is recorded for
      //    visibility, and the batch is held at `validated` (below) so the operator can retry.
      const isReviewRequired = err instanceof Conflict && err.code === "REVIEW_REQUIRED";
      const code = err instanceof Conflict ? err.code : "APPLY_FAILED";
      const message = isReviewRequired
        ? "A viagem já passou da confirmação; a atualização exige revisão autorizada (não aplicada)."
        : `Falha ao aplicar a linha (será re-tentada em nova confirmação): ${(err as Error).message}`;
      const existingReasons = Array.isArray(row.reasons)
        ? (row.reasons as { code: string; field?: string; message: string }[])
        : [];
      await db
        .update(importRows)
        .set({
          reasons: [...existingReasons, { code, message }],
          // Only REVIEW_REQUIRED is terminal → mark `error`. Transient failures keep their outcome so
          // they remain in the confirm `pending` set (valid/warning + applied_at NULL) for a re-run.
          ...(isReviewRequired ? { outcome: "error" as const } : {}),
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

  // A `potential_duplicate` row that applied also created a NEW trip, so it counts toward created.
  const createdCount = applied.filter(
    (r) => r.matchDecision === "new" || r.matchDecision === "potential_duplicate",
  ).length;
  const updatedCount = applied.filter((r) => r.matchDecision === "update").length;
  const errorRows = await db
    .select({ id: importRows.id })
    .from(importRows)
    .where(and(eq(importRows.importBatchId, batchId), eq(importRows.outcome, "error")));
  const errorCount = errorRows.length;

  await setBatchCounts(batchId, { createdCount, updatedCount, errorCount });
  // Confirm may have newly marked rows `error` (REVIEW_REQUIRED). Regenerate the downloadable error
  // report so it reflects post-confirm failures too (idempotent — overwrites the key).
  if (errorCount > 0) await runGenerateErrorReport({ batchId });

  // A row still `valid`/`warning` with `applied_at IS NULL` is RETRYABLE — it was either never reached
  // (a crash/interruption mid-confirm) or hit a transient apply failure. Hold the batch at `validated`
  // so the UI re-enables Confirm and a re-run applies exactly those rows (R8: re-run skips applied rows,
  // retries the rest, never duplicates). Only when nothing retryable remains is the batch `completed`.
  const retryable = await db
    .select({ id: importRows.id })
    .from(importRows)
    .where(
      and(
        eq(importRows.importBatchId, batchId),
        inArray(importRows.outcome, ["valid", "warning"]),
        isNull(importRows.appliedAt),
      ),
    )
    .limit(1);
  await setBatchStatus(batchId, retryable.length > 0 ? "validated" : "completed");

  // Audit the confirm at the batch level. `db` satisfies the writeAudit `Inserter` (Pick<DB,"insert">).
  await writeAudit(db, {
    entityType: "import_batch",
    entityId: batchId,
    action: "import.confirm",
    previousValue: null,
    // The link tallies ride on the same audit row: how many trips the file itself resourced, and how
    // many it could not (blocked by the eligibility rules, or naming a resource with no registry).
    newValue: { createdCount, updatedCount, errorCount, ...linkTally, ...closedTally },
    actorUserId,
  });
}

export async function registerConfirm(boss: PgBoss): Promise<void> {
  await work(boss, JOB.confirm, async (payload) => {
    await runConfirm(payload);
  });
}
