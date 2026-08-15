import { eq } from "drizzle-orm";
import {
  OPERATIONAL_FIELDS,
  type OperationalField,
  type UpdateOperationalFieldsInput,
} from "@brazil-tms/shared";
import { db } from "../client";
import { trips } from "../../schema";
import { writeAudit } from "../audit/write-audit";
import { Conflict, NotFound } from "../errors";
import { loadTripDetail, type TripDetail } from "./trip-dto";

/**
 * The operation's OWN annotations on a trip — solicitação, checklist, SM Raster, CT-e, doca
 * (2026-08-15). Each of these exists today only as a column of a hand-maintained spreadsheet, which
 * is why the spreadsheet cannot be switched off: it is the single place they live. This is the
 * service that gives them a home here.
 *
 * Two deliberate differences from `updateTripPlan`:
 *
 *  - NO post-confirmed review gate. These are not the plan the customer agreed to; they are notes
 *    the operation keeps, and the CT-e in particular is normally filled in AFTER the truck rolls.
 *    Gating them behind an authorized review would push the operation straight back to the
 *    spreadsheet — the exact outcome this exists to prevent. A trip that is `cancelled` or `billed`
 *    is closed to further annotation: nothing is meant to move after billing.
 *  - Stored in `operational_fields`, never in `customer_fields`. What the customer's file says and
 *    what our operation decided are different claims, and an import must never overwrite a person's
 *    entry — the columns are separate so that can't happen by accident.
 *
 * Every change writes ONE `trip.fields_update` audit row with per-field previous/new values, so
 * "who put this SM Raster here?" has an answer.
 */

const CLOSED_TO_ANNOTATION = new Set(["cancelled", "billed"]);

type FieldBag = Partial<Record<OperationalField, string | null>>;

export async function updateOperationalFields(
  tripId: string,
  changes: UpdateOperationalFieldsInput,
  actorUserId: string,
): Promise<TripDetail> {
  return db.transaction(async (tx) => {
    // Locked like every other trip write: the read, the per-field diff and the write all see one
    // snapshot, so two operators typing at once cannot lose each other's field.
    const currentRows = await tx
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .for("update")
      .limit(1);
    const current = currentRows[0];
    if (!current) throw new NotFound("NOT_FOUND", "Viagem não encontrada.");

    if (CLOSED_TO_ANNOTATION.has(current.currentStatus)) {
      throw new Conflict(
        "TRIP_CLOSED",
        "A viagem está encerrada: os campos da operação não podem mais ser alterados.",
      );
    }

    const stored: FieldBag = (current.operationalFields as FieldBag | null) ?? {};
    const next: FieldBag = { ...stored };
    const previousValue: Record<string, unknown> = {};
    const newValue: Record<string, unknown> = {};

    for (const field of OPERATIONAL_FIELDS) {
      const provided = changes[field];
      if (provided === undefined) continue; // absent = untouched (null = cleared)
      const before = stored[field] ?? null;
      if (before === provided) continue; // typing the same value is not a change
      if (provided === null) delete next[field];
      else next[field] = provided;
      previousValue[field] = before;
      newValue[field] = provided;
    }

    // Nothing actually differed — no write, no audit row. Re-saving an unchanged form is not an event.
    if (Object.keys(newValue).length === 0) {
      const unchanged = await loadTripDetail(tx, tripId);
      if (!unchanged) throw new NotFound("NOT_FOUND", "Viagem não encontrada.");
      return unchanged;
    }

    await tx
      .update(trips)
      .set({
        operationalFields: Object.keys(next).length > 0 ? next : null,
        updatedAt: new Date(),
      })
      .where(eq(trips.id, tripId));

    await writeAudit(tx, {
      entityType: "trip",
      entityId: tripId,
      action: "trip.fields_update",
      previousValue,
      newValue,
      actorUserId,
    });

    const detail = await loadTripDetail(tx, tripId);
    if (!detail) throw new NotFound("NOT_FOUND", "Viagem não encontrada.");
    return detail;
  });
}
