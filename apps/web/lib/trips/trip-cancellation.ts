import "server-only";
import { and, eq } from "drizzle-orm";
import { cancellationOptions, db, tripEvents, trips } from "@brazil-tms/db";
import { canTransition, cancelTripSchema, type CancelTripInput } from "@brazil-tms/shared";
import { writeAudit } from "@/lib/audit/write-audit";
import { Conflict } from "@/lib/api/respond";
import { loadTripDetail, type TripDetail } from "@/lib/trips/trip-dto";

/**
 * Cancel a trip (US4; R8, FR-019..FR-022). The five required inputs are enforced by parsing the
 * submitted body with `cancelTripSchema` — a missing required field (e.g. `responsibleParty`) throws
 * a `ZodError` that the route layer maps to 400, so the "five required inputs" rule lives in one
 * place and cannot be bypassed by calling the service directly.
 *
 * `reasonCode` and `billingImpact` are NOT enums; they are validated against the ACTIVE rows in the
 * config-driven `cancellation_options` table (data-model §3, Constitution V). When the required
 * `kind` has no active rows, cancellation FAILS with `CANCELLATION_NOT_CONFIGURED`
 * ("missing configuration → fail", FR-021) — business must supply codes before any trip can cancel.
 *
 * The cancellable check (`canTransition(..., "cancelled")`) runs BEFORE the transaction so a denied
 * cancel changes no state (SC-003). The single transaction writes the guarded `trips` update, the
 * append-only `status_change` event, and the audit row together so a cancellation is never unlogged.
 */
export async function cancelTrip(
  tripId: string,
  input: CancelTripInput,
  actorUserId: string,
): Promise<TripDetail> {
  // Enforces the five required inputs; a missing field throws ZodError → 400.
  const parsed = cancelTripSchema.parse(input);

  // Config-driven value sets — both `kind`s must be configured (FR-021).
  const options = await db
    .select({ kind: cancellationOptions.kind, code: cancellationOptions.code })
    .from(cancellationOptions)
    .where(eq(cancellationOptions.active, true));
  const reasonCodes = new Set(options.filter((o) => o.kind === "reason").map((o) => o.code));
  const billingCodes = new Set(
    options.filter((o) => o.kind === "billing_impact").map((o) => o.code),
  );

  if (reasonCodes.size === 0 || billingCodes.size === 0) {
    throw new Conflict("CANCELLATION_NOT_CONFIGURED", "Motivos de cancelamento não configurados.");
  }
  if (!reasonCodes.has(parsed.reasonCode)) {
    throw new Conflict("INVALID_REASON_CODE", "Motivo de cancelamento inválido.");
  }
  if (!billingCodes.has(parsed.billingImpact)) {
    throw new Conflict("INVALID_BILLING_IMPACT", "Impacto de faturamento inválido.");
  }

  const currentRows = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  const row = currentRows[0];
  if (!row) throw new Conflict("NOT_FOUND", "Viagem não encontrada.");

  // Cancellable check BEFORE the transaction so a denied cancel changes no state (SC-003).
  if (!canTransition(row.currentStatus, "cancelled")) {
    throw new Conflict("NOT_CANCELLABLE", "A viagem não pode ser cancelada neste status.");
  }

  const cancelledAt = parsed.cancellationTimestamp ?? new Date();

  return db.transaction(async (tx) => {
    const now = new Date();
    // Status-guarded update: only succeeds if the trip is still in the status we checked (optimistic).
    const updated = await tx
      .update(trips)
      .set({
        currentStatus: "cancelled",
        cancellationReasonCode: parsed.reasonCode,
        cancellationResponsibleParty: parsed.responsibleParty,
        cancellationBillingImpact: parsed.billingImpact,
        cancelledAt,
        updatedAt: now,
      })
      .where(and(eq(trips.id, tripId), eq(trips.currentStatus, row.currentStatus)))
      .returning();
    if (updated.length === 0) {
      throw new Conflict("STALE_TRANSITION", "A viagem já mudou de status.");
    }

    await tx.insert(tripEvents).values({
      tripId,
      eventType: "status_change",
      statusBefore: row.currentStatus,
      statusAfter: "cancelled",
      eventTimestamp: parsed.cancellationTimestamp ?? null,
      source: "operator_manual",
      actorUserId,
    });

    await writeAudit(tx, {
      entityType: "trip",
      entityId: tripId,
      action: "trip.cancel",
      previousValue: { currentStatus: row.currentStatus },
      newValue: {
        currentStatus: "cancelled",
        cancellationReasonCode: parsed.reasonCode,
        cancellationResponsibleParty: parsed.responsibleParty,
        cancellationBillingImpact: parsed.billingImpact,
      },
      actorUserId,
    });

    const detail = await loadTripDetail(tx, tripId);
    if (!detail) throw new Conflict("NOT_FOUND", "Viagem não encontrada.");
    return detail;
  });
}
