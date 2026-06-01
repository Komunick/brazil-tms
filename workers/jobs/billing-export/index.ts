import ExcelJS from "exceljs";
import { type PgBoss } from "pg-boss";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@brazil-tms/db/client";
import {
  billingItems,
  Conflict,
  customers,
  exportBatches,
  transitionTripStatus,
  trips,
} from "@brazil-tms/db";
import { exportStorageKey, putExport } from "@brazil-tms/db/storage";
import { type BillingExportPayload } from "@brazil-tms/shared";
import { JOB, work } from "../../lib/queue";

/**
 * Feature 008 — the on-demand `billing.export` worker job (data-model §12, R11). Off the request path:
 * set `running` → for each candidate `billing_ready` trip (customer+period) link `export_batch_id`
 * then drive the guarded `billing_ready → billed` transition (reused `transitionTripStatus`; LINK
 * BEFORE TRANSITION so a crash between the two writes can't strand a trip billed-but-unlinked) →
 * reconcile (unlink any trip linked to this batch that did NOT end up `billed`, e.g. disputed
 * mid-export) → build the file from the AUTHORITATIVE billed+linked set → put to the `billing-exports`
 * bucket → ONLY THEN set `file_storage_key`/`trip_count`/`total_amount_cents`/`completed`. A throw sets
 * the batch `failed` + `error_message` (durable status).
 *
 * FR-021 (never leave a trip half-transitioned, never complete with a non-billed trip): the file/totals
 * derive solely from trips that are `billed` AND linked to this batch; a `billing_ready` trip that was
 * linked but then moved (its guarded transition raising `STALE_TRANSITION`) is unlinked by the reconcile
 * and excluded. Idempotent on retry: already-`billed`+linked trips stay in the set (never double-billed —
 * only `billing_ready` candidates are transitioned).
 *
 * Until the exact finance format lands, the export uses the LABELED DEFAULT column set (§29 Input #4).
 */

interface ExportRow {
  tripId: string;
  externalTripId: string | null;
  customerName: string | null;
  billingPeriod: string;
  baseFreightCents: number | null;
  finalCents: number | null;
}

/** Per-trip computed final billable value (base freight + live adjustments, discount negated). */
const finalCentsSql = sql<string | null>`${billingItems.baseFreightCents} + COALESCE((
  SELECT SUM(CASE WHEN ba.type = 'discount' THEN -ba.amount_cents ELSE ba.amount_cents END)
  FROM billing_adjustments ba
  WHERE ba.billing_item_id = ${billingItems.id} AND ba.removed_at IS NULL
), 0)`;

async function setBatch(
  exportBatchId: string,
  patch: Partial<typeof exportBatches.$inferInsert>,
): Promise<void> {
  await db
    .update(exportBatches)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(exportBatches.id, exportBatchId));
}

/** The billing-ready trips for a customer+period — the candidates to bill into this batch. */
async function selectBillingReadyTripIds(
  customerId: string,
  billingPeriod: string,
): Promise<string[]> {
  const rows = await db
    .select({ tripId: trips.id })
    .from(trips)
    .innerJoin(billingItems, eq(billingItems.tripId, trips.id))
    .where(
      and(
        eq(trips.currentStatus, "billing_ready"),
        eq(trips.customerId, customerId),
        eq(billingItems.billingPeriod, billingPeriod),
      ),
    );
  return rows.map((r) => r.tripId);
}

/**
 * The AUTHORITATIVE export set: trips that are `billed` AND linked to this batch. The file + totals are
 * built from exactly this set, so a trip that was linked but then moved out of `billed`/`billing_ready`
 * (e.g. disputed mid-export, then unlinked by the reconcile) is never present in a completed export.
 */
async function selectBilledLinkedRows(exportBatchId: string): Promise<ExportRow[]> {
  const rows = await db
    .select({
      tripId: trips.id,
      externalTripId: trips.externalTripId,
      customerName: customers.name,
      billingPeriod: billingItems.billingPeriod,
      baseFreightCents: billingItems.baseFreightCents,
      finalCents: finalCentsSql,
    })
    .from(trips)
    .innerJoin(billingItems, eq(billingItems.tripId, trips.id))
    .leftJoin(customers, eq(trips.customerId, customers.id))
    .where(and(eq(trips.currentStatus, "billed"), eq(billingItems.exportBatchId, exportBatchId)));
  return rows.map((r) => ({
    tripId: r.tripId,
    externalTripId: r.externalTripId,
    customerName: r.customerName,
    billingPeriod: r.billingPeriod,
    baseFreightCents: r.baseFreightCents,
    finalCents: r.finalCents == null ? null : Number(r.finalCents),
  }));
}

/**
 * Unlink any trip linked to this batch that did NOT end up `billed` — e.g. a `billing_ready` trip that
 * was linked (link-before-transition) but then moved to `disputed` by another actor, so its guarded
 * `→ billed` transition failed. Unlinking + excluding it (below, via {@link selectBilledLinkedRows})
 * keeps a non-`billed` trip out of a completed export (the P1 race the review flagged).
 */
async function unlinkNonBilled(exportBatchId: string): Promise<void> {
  const stuck = await db
    .select({ tripId: billingItems.tripId })
    .from(billingItems)
    .innerJoin(trips, eq(trips.id, billingItems.tripId))
    .where(and(eq(billingItems.exportBatchId, exportBatchId), ne(trips.currentStatus, "billed")));
  if (stuck.length === 0) return;
  await db
    .update(billingItems)
    .set({ exportBatchId: null, updatedAt: new Date() })
    .where(
      inArray(
        billingItems.tripId,
        stuck.map((r) => r.tripId),
      ),
    );
}

/** Build the export file (labeled default columns) as bytes + the content type, per format. */
async function buildFile(
  rows: ExportRow[],
  format: string,
): Promise<{ bytes: Buffer; contentType: string; ext: string }> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Faturamento");
  sheet.columns = [
    { header: "ID Externo", key: "externalTripId", width: 24 },
    { header: "Cliente", key: "customerName", width: 30 },
    { header: "Período", key: "billingPeriod", width: 12 },
    { header: "Frete base (R$)", key: "base", width: 18 },
    { header: "Total a faturar (R$)", key: "final", width: 20 },
  ];
  for (const r of rows) {
    sheet.addRow({
      externalTripId: r.externalTripId ?? r.tripId,
      customerName: r.customerName ?? "",
      billingPeriod: r.billingPeriod,
      base: r.baseFreightCents != null ? r.baseFreightCents / 100 : "",
      final: r.finalCents != null ? r.finalCents / 100 : "",
    });
  }

  if (format === "csv") {
    const ab = await workbook.csv.writeBuffer();
    return { bytes: Buffer.from(ab as ArrayBuffer), contentType: "text/csv", ext: "csv" };
  }
  const ab = await workbook.xlsx.writeBuffer();
  return {
    bytes: Buffer.from(ab as ArrayBuffer),
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
  };
}

export async function runBillingExport(payload: BillingExportPayload): Promise<void> {
  const { exportBatchId, actorUserId } = payload;

  const batchRows = await db
    .select()
    .from(exportBatches)
    .where(eq(exportBatches.id, exportBatchId))
    .limit(1);
  const batch = batchRows[0];
  if (!batch) return; // nothing to export against

  try {
    await setBatch(exportBatchId, { status: "running" });

    // Bill each candidate billing-ready trip. LINK BEFORE the guarded transition (`transitionTripStatus`
    // opens its own tx, the link is a separate statement) so a throw/crash between the two writes can
    // never strand a trip billed-but-unlinked — the only intermediate states are billing_ready+unlinked
    // (re-picked by the candidate query on retry) or billing_ready+linked (reconciled below).
    const candidateIds = await selectBillingReadyTripIds(batch.customerId, batch.billingPeriod);
    for (const tripId of candidateIds) {
      await db
        .update(billingItems)
        .set({ exportBatchId, updatedAt: new Date() })
        .where(eq(billingItems.tripId, tripId));
      try {
        await transitionTripStatus(
          tripId,
          { toStatus: "billed", expectedFromStatus: "billing_ready" },
          actorUserId,
        );
      } catch (err) {
        // The trip moved out of `billing_ready` (e.g. another actor disputed it) between the candidate
        // query and the transition. Don't fail the whole batch — leave it for the reconcile, which
        // unlinks any linked-but-not-billed trip so it never lands in a completed export.
        if (err instanceof Conflict && err.code === "STALE_TRANSITION") continue;
        throw err;
      }
    }

    // Reconcile: unlink any trip linked to this batch that did NOT end up `billed` (the disputed-mid-
    // export race). Then build the file + totals from the AUTHORITATIVE billed+linked set only.
    await unlinkNonBilled(exportBatchId);
    const rows = await selectBilledLinkedRows(exportBatchId);

    const { bytes, contentType, ext } = await buildFile(rows, batch.format);
    const key = exportStorageKey(exportBatchId, ext);
    await putExport(key, bytes, contentType);

    const total = rows.reduce((sum, r) => sum + (r.finalCents ?? 0), 0);

    // Mark completed LAST (after every included trip is billed + linked and the set is reconciled).
    await setBatch(exportBatchId, {
      fileStorageKey: key,
      tripCount: rows.length,
      totalAmountCents: total,
      status: "completed",
    });
  } catch (err) {
    await setBatch(exportBatchId, {
      status: "failed",
      errorMessage: (err as Error).message.slice(0, 1000),
    });
    throw err; // let pg-boss record the failure (handlers are idempotent)
  }
}

export async function registerBillingExport(boss: PgBoss): Promise<void> {
  await work(boss, JOB.billingExport, async (payload) => {
    await runBillingExport(payload);
  });
}
