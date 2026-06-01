import ExcelJS from "exceljs";
import { type PgBoss } from "pg-boss";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@brazil-tms/db/client";
import {
  billingItems,
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
 * set `running` → select the INCLUDED set (the customer+period billing-ready trips PLUS any already
 * linked to this batch by a prior partial run) → transition each still-billing_ready trip
 * `billing_ready → billed` (reused `transitionTripStatus`) + link `billing_items.export_batch_id` →
 * generate the file (ExcelJS xlsx/csv — no new dep) → put to the `billing-exports` bucket → ONLY THEN
 * set `file_storage_key`/`trip_count`/`total_amount_cents`/`completed`. A throw sets the batch `failed`
 * + `error_message` (durable status); the catch keeps the batch out of `completed` until every included
 * trip is billed + linked, so FR-021 holds.
 *
 * Idempotent + complete on retry: the select re-includes trips already billed+linked to THIS batch (via
 * the `export_batch_id` predicate), so they stay in the regenerated file/totals and are never
 * double-billed (the loop skips trips no longer `billing_ready`).
 *
 * Until the exact finance format lands, the export uses the LABELED DEFAULT column set (§29 Input #4).
 */

interface ExportRow {
  tripId: string;
  currentStatus: string;
  externalTripId: string | null;
  customerName: string | null;
  billingPeriod: string;
  baseFreightCents: number | null;
  finalCents: number | null;
}

async function setBatch(
  exportBatchId: string,
  patch: Partial<typeof exportBatches.$inferInsert>,
): Promise<void> {
  await db
    .update(exportBatches)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(exportBatches.id, exportBatchId));
}

/**
 * The INCLUDED set for a batch: the customer+period billing-ready trips PLUS any trip already linked to
 * this batch by a prior (partial) run, each with its computed final billable value + current status (so
 * the caller transitions only the still-`billing_ready` ones). The `export_batch_id` arm makes a retry
 * re-include trips a prior run already billed+linked — they stay in the regenerated file/totals.
 */
async function selectIncludedRows(
  customerId: string,
  billingPeriod: string,
  exportBatchId: string,
): Promise<ExportRow[]> {
  const finalCents = sql<string | null>`${billingItems.baseFreightCents} + COALESCE((
    SELECT SUM(CASE WHEN ba.type = 'discount' THEN -ba.amount_cents ELSE ba.amount_cents END)
    FROM billing_adjustments ba
    WHERE ba.billing_item_id = ${billingItems.id} AND ba.removed_at IS NULL
  ), 0)`;

  const rows = await db
    .select({
      tripId: trips.id,
      currentStatus: trips.currentStatus,
      externalTripId: trips.externalTripId,
      customerName: customers.name,
      billingPeriod: billingItems.billingPeriod,
      baseFreightCents: billingItems.baseFreightCents,
      finalCents,
    })
    .from(trips)
    .innerJoin(billingItems, eq(billingItems.tripId, trips.id))
    .leftJoin(customers, eq(trips.customerId, customers.id))
    .where(
      or(
        and(
          eq(trips.currentStatus, "billing_ready"),
          eq(trips.customerId, customerId),
          eq(billingItems.billingPeriod, billingPeriod),
        ),
        eq(billingItems.exportBatchId, exportBatchId),
      ),
    );

  return rows.map((r) => ({
    tripId: r.tripId,
    currentStatus: r.currentStatus,
    externalTripId: r.externalTripId,
    customerName: r.customerName,
    billingPeriod: r.billingPeriod,
    baseFreightCents: r.baseFreightCents,
    finalCents: r.finalCents == null ? null : Number(r.finalCents),
  }));
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

    const rows = await selectIncludedRows(batch.customerId, batch.billingPeriod, exportBatchId);

    // Transition + link EVERY included trip FIRST (FR-021: never leave a trip half-transitioned). A
    // still-billing_ready trip is billed via the reused machine; a trip already billed by a prior run
    // (retry) is only (re-)linked. The batch is NOT marked completed until this whole set succeeds.
    //
    // LINK BEFORE TRANSITION (atomicity): `transitionTripStatus` opens its own transaction and the
    // link is a separate statement, so a throw/crash BETWEEN them must not strand a trip. Linking
    // first means the only intermediate states are billing_ready+unlinked (re-included by the
    // status arm) or billing_ready+linked (re-included by BOTH arms and transitioned on retry) — a
    // billed-but-unlinked trip (which the retry would drop) is unreachable.
    for (const r of rows) {
      await db
        .update(billingItems)
        .set({ exportBatchId, updatedAt: new Date() })
        .where(eq(billingItems.tripId, r.tripId));
      if (r.currentStatus === "billing_ready") {
        await transitionTripStatus(
          r.tripId,
          { toStatus: "billed", expectedFromStatus: "billing_ready" },
          actorUserId,
        );
      }
    }

    // Generate the file over the full included set, then mark completed LAST.
    const { bytes, contentType, ext } = await buildFile(rows, batch.format);
    const key = exportStorageKey(exportBatchId, ext);
    await putExport(key, bytes, contentType);

    const total = rows.reduce((sum, r) => sum + (r.finalCents ?? 0), 0);

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
