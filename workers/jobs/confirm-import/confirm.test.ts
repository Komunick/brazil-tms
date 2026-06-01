import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  customers,
  alerts,
  db,
  importBatches,
  importRows,
  importTemplates,
  locations,
  trips,
  users,
} from "@brazil-tms/db";
import { originalStorageKey, putOriginal } from "@brazil-tms/db/storage";
import { runParse } from "../parse";
import { runValidate } from "../validate";
import { runDetectDuplicates } from "../detect-duplicates";
import { runConfirm } from "./index";

/**
 * T039 — confirm job integration test: drive the full US1 pipeline (parse → validate →
 * detect-duplicates → confirm) against the live dev DB + Storage, asserting trips are created in
 * `received` linked to the batch, the confirm is idempotent (a re-run creates 0 new trips), and the
 * batch counts are tallied. Static imports per project convention; skips without DATABASE_URL.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("confirm job — full pipeline (integration)", () => {
  let actorId = "";
  let customerId = "";
  let templateId = "";
  const createdBatchIds: string[] = [];
  const createdCustomerIds: string[] = [];
  const createdTripIds: string[] = [];

  function uniq(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  beforeAll(async () => {
    const admin = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@braziltransports.com.br"))
      .limit(1);
    actorId = admin[0]?.id ?? "";
    expect(actorId, "seeded admin must exist (run db:seed)").not.toBe("");

    const customer = await db
      .insert(customers)
      .values({ name: "Cliente Import Confirm", customerCode: uniq("CUST-CONFIRM") })
      .returning();
    customerId = customer[0]!.id;
    createdCustomerIds.push(customerId);

    await db.insert(locations).values([
      { customerId, code: "ORIG", name: "Origem", country: "BR" },
      { customerId, code: "DEST", name: "Destino", country: "BR" },
    ]);

    const template = await db
      .insert(importTemplates)
      .values({
        customerId,
        name: uniq("Template Confirm"),
        version: 1,
        fileType: "csv",
        columnMappings: [
          { source: "trip_id", target: "externalTripId" },
          { source: "origin", target: "originCode" },
          { source: "destination", target: "destinationCode" },
          { source: "pickup_start", target: "plannedPickupWindowStart" },
          { source: "vehicle", target: "plannedVehicleType" },
        ],
        parsingRules: {
          dateFormats: ["yyyy-MM-dd HH:mm"],
          timezone: "America/Sao_Paulo",
          decimalSeparator: ",",
          thousandSeparator: ".",
        },
        requiredOverrides: [],
      })
      .returning();
    templateId = template[0]!.id;
  });

  afterAll(async () => {
    // FK-safe order for the trips ⇄ import_batches cycle: import_rows reference trips
    // (target_trip_id) AND trips reference import_batches (import_batch_id). So: drop ALL import_rows
    // first → then the trips → then the import_batches → then per-customer config.
    for (const batchId of createdBatchIds) {
      await db.delete(importRows).where(eq(importRows.importBatchId, batchId));
    }
    for (const tripId of createdTripIds) {
      await db.delete(auditLogs).where(eq(auditLogs.entityId, tripId));
    }
    if (createdTripIds.length > 0) {
      await db.delete(alerts).where(inArray(alerts.tripId, createdTripIds));
      await db.delete(trips).where(inArray(trips.id, createdTripIds));
    }
    for (const batchId of createdBatchIds) {
      await db.delete(auditLogs).where(eq(auditLogs.entityId, batchId));
      await db.delete(importBatches).where(eq(importBatches.id, batchId));
    }
    for (const cid of createdCustomerIds) {
      await db.delete(importTemplates).where(eq(importTemplates.customerId, cid));
      await db.delete(locations).where(eq(locations.customerId, cid));
      await db.delete(auditLogs).where(eq(auditLogs.entityId, cid));
      await db.delete(customers).where(eq(customers.id, cid));
    }
  });

  async function seedBatchWithCsv(csv: string): Promise<string> {
    const batch = await db
      .insert(importBatches)
      .values({
        customerId,
        templateId,
        fileName: "trips.csv",
        storageKey: "pending",
        uploadedBy: actorId,
      })
      .returning();
    const batchId = batch[0]!.id;
    createdBatchIds.push(batchId);
    const key = originalStorageKey(batchId);
    await db.update(importBatches).set({ storageKey: key }).where(eq(importBatches.id, batchId));
    await putOriginal(batchId, Buffer.from(csv, "utf-8"), "text/csv");
    return batchId;
  }

  it("creates trips in 'received' linked to the batch; re-running confirm is idempotent", async () => {
    const extA = uniq("SH-A");
    const extB = uniq("SH-B");
    const csv = [
      "trip_id,origin,destination,pickup_start,vehicle",
      `${extA},ORIG,DEST,2026-06-01 08:00,Truck`,
      `${extB},ORIG,DEST,2026-06-02 09:30,Carreta`,
    ].join("\n");

    const batchId = await seedBatchWithCsv(csv);

    await runParse({ batchId, storageKey: originalStorageKey(batchId) });
    await runValidate({ batchId });
    await runDetectDuplicates({ batchId });

    // After detect-duplicates: both rows are 'new', status 'validated'.
    const afterDetect = await db
      .select({ status: importBatches.status, createdCount: importBatches.createdCount })
      .from(importBatches)
      .where(eq(importBatches.id, batchId))
      .limit(1);
    expect(afterDetect[0]!.status).toBe("validated");
    expect(afterDetect[0]!.createdCount).toBe(2);

    await runConfirm({ batchId, actorUserId: actorId });

    const created = await db
      .select()
      .from(trips)
      .where(eq(trips.importBatchId, batchId));
    for (const t of created) createdTripIds.push(t.id);

    expect(created).toHaveLength(2);
    for (const t of created) {
      expect(t.currentStatus).toBe("received");
      expect(t.importBatchId).toBe(batchId);
      expect(t.customerId).toBe(customerId);
    }
    const externalIds = created.map((t) => t.externalTripId).sort();
    expect(externalIds).toEqual([extA, extB].sort());

    // Rows are linked + applied.
    const rows = await db
      .select()
      .from(importRows)
      .where(eq(importRows.importBatchId, batchId));
    for (const r of rows) {
      expect(r.appliedAt).not.toBeNull();
      expect(r.targetTripId).not.toBeNull();
    }

    const batchAfter = await db
      .select({
        status: importBatches.status,
        createdCount: importBatches.createdCount,
        updatedCount: importBatches.updatedCount,
      })
      .from(importBatches)
      .where(eq(importBatches.id, batchId))
      .limit(1);
    expect(batchAfter[0]!.status).toBe("completed");
    expect(batchAfter[0]!.createdCount).toBe(2);
    expect(batchAfter[0]!.updatedCount).toBe(0);

    // The import.confirm audit row is written at the batch level.
    const confirmAudit = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, batchId), eq(auditLogs.action, "import.confirm")));
    expect(confirmAudit.length).toBeGreaterThanOrEqual(1);

    // RE-RUN confirm → idempotent: no NEW trips created.
    const tripCountBefore = (
      await db.select({ id: trips.id }).from(trips).where(eq(trips.importBatchId, batchId))
    ).length;

    await runConfirm({ batchId, actorUserId: actorId });

    const tripCountAfter = (
      await db.select({ id: trips.id }).from(trips).where(eq(trips.importBatchId, batchId))
    ).length;
    expect(tripCountAfter).toBe(tripCountBefore);
    expect(tripCountAfter).toBe(2);
  });

  it("a transient apply failure keeps the row retryable and holds the batch at 'validated'; re-confirm applies it", async () => {
    // A dedicated destination with a KNOWN id so we can drop it (forcing a confirm-time FK failure on
    // createTrip — a non-REVIEW_REQUIRED, non-unique error → APPLY_FAILED) and later restore it with the
    // SAME id to prove the still-pending row is RE-TRIED and applied on a second confirm.
    const destId = crypto.randomUUID();
    await db
      .insert(locations)
      .values({ id: destId, customerId, code: "DEST-RETRY", name: "Destino Retry", country: "BR" });

    const ext = uniq("SH-RETRY");
    const csv = [
      "trip_id,origin,destination,pickup_start,vehicle",
      `${ext},ORIG,DEST-RETRY,2026-06-01 08:00,Truck`,
    ].join("\n");
    const batchId = await seedBatchWithCsv(csv);
    await runParse({ batchId, storageKey: originalStorageKey(batchId) });
    await runValidate({ batchId }); // resolves DEST-RETRY → destId into mapped
    await runDetectDuplicates({ batchId }); // status validated, match new

    // Break the resolved location between validate and confirm → createTrip fails its FK.
    await db.delete(locations).where(eq(locations.id, destId));
    await runConfirm({ batchId, actorUserId: actorId });

    // The row is NOT terminally errored (still retryable), is unapplied, and the batch is HELD at
    // 'validated' so the operator can re-confirm — not silently 'completed'.
    const rowAfter1 = (
      await db.select().from(importRows).where(eq(importRows.importBatchId, batchId))
    )[0]!;
    expect(rowAfter1.outcome).not.toBe("error");
    expect(rowAfter1.appliedAt).toBeNull();
    expect(rowAfter1.targetTripId).toBeNull();
    const batch1 = (
      await db
        .select({ status: importBatches.status })
        .from(importBatches)
        .where(eq(importBatches.id, batchId))
        .limit(1)
    )[0]!;
    expect(batch1.status).toBe("validated");

    // Restore the location (same id) and re-confirm → the still-pending row now applies.
    await db
      .insert(locations)
      .values({ id: destId, customerId, code: "DEST-RETRY", name: "Destino Retry", country: "BR" });
    await runConfirm({ batchId, actorUserId: actorId });

    const created = await db.select().from(trips).where(eq(trips.importBatchId, batchId));
    for (const t of created) createdTripIds.push(t.id);
    expect(created).toHaveLength(1);
    const rowAfter2 = (
      await db.select().from(importRows).where(eq(importRows.importBatchId, batchId))
    )[0]!;
    expect(rowAfter2.appliedAt).not.toBeNull();
    const batch2 = (
      await db
        .select({ status: importBatches.status })
        .from(importBatches)
        .where(eq(importBatches.id, batchId))
        .limit(1)
    )[0]!;
    expect(batch2.status).toBe("completed");
  });
});
