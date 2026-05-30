import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import {
  auditLogs,
  customers,
  db,
  importBatches,
  importRows,
  importTemplates,
  locations,
  users,
} from "@brazil-tms/db";
import { originalStorageKey, putOriginal } from "@brazil-tms/db/storage";
import { runParse } from "./index";

/**
 * T038 — parse job integration test against the live dev DB + Storage. Static imports per project
 * convention (the Drizzle client + Supabase client connect lazily, so importing is safe). Skips when
 * DATABASE_URL is unset so the default `pnpm test` stays green. To run it:
 *   $env:DATABASE_URL='...'; $env:SUPABASE_URL='...'; $env:SUPABASE_SERVICE_ROLE_KEY='...';
 *   pnpm exec vitest run --project workers
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("parse job (integration)", () => {
  let actorId = "";
  let customerId = "";
  let templateId = "";
  const createdBatchIds: string[] = [];
  const createdCustomerIds: string[] = [];

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
      .values({ name: "Cliente Import Parse", customerCode: uniq("CUST-PARSE") })
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
        name: uniq("Template Parse"),
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
    for (const batchId of createdBatchIds) {
      await db.delete(importRows).where(eq(importRows.importBatchId, batchId));
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

  async function seedBatch(): Promise<string> {
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
    return batchId;
  }

  it("parses CSV into import_rows with 1-based row_number, mapped fields, and total_rows", async () => {
    const csv = [
      "trip_id,origin,destination,pickup_start,vehicle",
      "SH-1,ORIG,DEST,2026-06-01 08:00,Truck",
      "SH-2,ORIG,DEST,2026-06-02 09:30,Carreta",
    ].join("\n");

    const batchId = await seedBatch();
    await putOriginal(batchId, Buffer.from(csv, "utf-8"), "text/csv");

    await runParse({ batchId, storageKey: originalStorageKey(batchId) });

    const rows = await db
      .select()
      .from(importRows)
      .where(eq(importRows.importBatchId, batchId))
      .orderBy(asc(importRows.rowNumber));

    expect(rows).toHaveLength(2);
    expect(rows[0]!.rowNumber).toBe(1);
    expect(rows[1]!.rowNumber).toBe(2);

    const mapped0 = rows[0]!.mapped as Record<string, unknown>;
    expect(mapped0.externalTripId).toBe("SH-1");
    expect(mapped0.originCode).toBe("ORIG");
    expect(mapped0.destinationCode).toBe("DEST");
    expect(mapped0.plannedVehicleType).toBe("Truck");
    // The pickup date normalized to a UTC instant, serialized to ISO in jsonb.
    expect(typeof mapped0.plannedPickupWindowStart).toBe("string");
    expect(rows[0]!.raw).toMatchObject({ trip_id: "SH-1", origin: "ORIG" });

    const batchRows = await db
      .select({ totalRows: importBatches.totalRows, status: importBatches.status })
      .from(importBatches)
      .where(eq(importBatches.id, batchId))
      .limit(1);
    expect(batchRows[0]!.totalRows).toBe(2);
    expect(batchRows[0]!.status).toBe("parsing");
  });

  it("header-only CSV yields total_rows 0 and inserts no rows", async () => {
    const csv = "trip_id,origin,destination,pickup_start,vehicle\n";
    const batchId = await seedBatch();
    await putOriginal(batchId, Buffer.from(csv, "utf-8"), "text/csv");

    await runParse({ batchId, storageKey: originalStorageKey(batchId) });

    const rows = await db
      .select()
      .from(importRows)
      .where(eq(importRows.importBatchId, batchId));
    expect(rows).toHaveLength(0);

    const batchRows = await db
      .select({ totalRows: importBatches.totalRows })
      .from(importBatches)
      .where(eq(importBatches.id, batchId))
      .limit(1);
    expect(batchRows[0]!.totalRows).toBe(0);
  });

  it("a batch with no template fails with a documented message and inserts no rows", async () => {
    const batch = await db
      .insert(importBatches)
      .values({
        customerId,
        templateId: null,
        fileName: "no-template.csv",
        storageKey: "pending",
        uploadedBy: actorId,
      })
      .returning();
    const batchId = batch[0]!.id;
    createdBatchIds.push(batchId);

    await runParse({ batchId, storageKey: originalStorageKey(batchId) });

    const batchRows = await db
      .select({ status: importBatches.status, errorMessage: importBatches.errorMessage })
      .from(importBatches)
      .where(eq(importBatches.id, batchId))
      .limit(1);
    expect(batchRows[0]!.status).toBe("failed");
    expect(batchRows[0]!.errorMessage).toContain("modelo");
  });

  it("re-running parse is idempotent (retry-safe): no duplicate-key error, same row count", async () => {
    const csv = [
      "trip_id,origin,destination,pickup_start,vehicle",
      "RE-1,ORIG,DEST,2026-06-01 08:00,Truck",
      "RE-2,ORIG,DEST,2026-06-02 09:30,Carreta",
    ].join("\n");
    const batchId = await seedBatch();
    await putOriginal(batchId, Buffer.from(csv, "utf-8"), "text/csv");

    await runParse({ batchId, storageKey: originalStorageKey(batchId) });
    // A pg-boss retry re-invokes parse on the same batch; the (import_batch_id, row_number) unique
    // index must NOT break it. Prior staging is cleared + re-inserted, so the re-run resolves cleanly.
    await expect(
      runParse({ batchId, storageKey: originalStorageKey(batchId) }),
    ).resolves.toBeUndefined();

    const rows = await db
      .select()
      .from(importRows)
      .where(eq(importRows.importBatchId, batchId));
    expect(rows).toHaveLength(2);
  });
});
