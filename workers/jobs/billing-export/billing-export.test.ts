import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  auditLogs,
  billingAdjustments,
  billingItems,
  customers,
  alerts,
  db,
  exportBatches,
  locations,
  tripEvents,
  trips,
  users,
} from "@brazil-tms/db";
import { runBillingExport } from "./index";

/**
 * Feature 008 (US5, T101) — the billing-export worker job against the live dev DB + Storage. Static
 * imports; skips when DATABASE_URL is unset. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for putExport.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const PERIOD = "2026-08";

describe.skipIf(!hasDb)("billing.export job (integration, US5)", () => {
  let actorId = "";
  let customerId = "";
  let originId = "";
  let destId = "";
  const tripIds: string[] = [];
  const batchIds: string[] = [];

  function code(p: string): string {
    return `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  async function seedReadyTrip(opts: { adjustment?: number } = {}): Promise<string> {
    const id = (
      await db
        .insert(trips)
        .values({
          customerId,
          originLocationId: originId,
          destinationLocationId: destId,
          originalPlan: {},
          currentStatus: "billing_ready",
        })
        .returning({ id: trips.id })
    )[0]!.id;
    tripIds.push(id);
    const item = (
      await db
        .insert(billingItems)
        .values({ tripId: id, customerId, baseFreightCents: 150_000, billingPeriod: PERIOD })
        .returning({ id: billingItems.id })
    )[0]!.id;
    if (opts.adjustment != null) {
      await db.insert(billingAdjustments).values({
        billingItemId: item,
        type: "toll",
        amountCents: opts.adjustment,
        createdByUserId: actorId,
      });
    }
    return id;
  }

  async function insertBatch(format: "xlsx" | "csv"): Promise<string> {
    const id = (
      await db
        .insert(exportBatches)
        .values({ customerId, billingPeriod: PERIOD, format, generatedByUserId: actorId, status: "queued" })
        .returning({ id: exportBatches.id })
    )[0]!.id;
    batchIds.push(id);
    return id;
  }

  beforeAll(async () => {
    actorId = (
      await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, "admin@braziltransports.com.br"))
        .limit(1)
    )[0]!.id;
    customerId = (
      await db.insert(customers).values({ name: "Cli Exp Job", customerCode: code("C") }).returning()
    )[0]!.id;
    originId = (await db.insert(locations).values({ customerId, code: code("O"), name: "O" }).returning())[0]!.id;
    destId = (await db.insert(locations).values({ customerId, code: code("D"), name: "D" }).returning())[0]!.id;
  });

  afterAll(async () => {
    for (const id of tripIds) {
      const items = await db.select({ id: billingItems.id }).from(billingItems).where(eq(billingItems.tripId, id));
      for (const it of items) await db.delete(billingAdjustments).where(eq(billingAdjustments.billingItemId, it.id));
      await db.delete(billingItems).where(eq(billingItems.tripId, id));
      await db.delete(tripEvents).where(eq(tripEvents.tripId, id));
      await db.delete(auditLogs).where(eq(auditLogs.entityId, id));
      await db.delete(alerts).where(eq(alerts.tripId, id));
      await db.delete(trips).where(eq(trips.id, id));
    }
    for (const id of batchIds) await db.delete(auditLogs).where(eq(auditLogs.entityId, id));
    await db.delete(exportBatches).where(eq(exportBatches.customerId, customerId));
    for (const id of [originId, destId]) if (id) await db.delete(locations).where(eq(locations.id, id));
    await db.delete(customers).where(eq(customers.id, customerId));
  });

  it("xlsx: completes the batch, marks the trip billed + links the export, totals the final value", async () => {
    const tripId = await seedReadyTrip({ adjustment: 10_000 }); // 150000 + 10000 = 160000
    const batchId = await insertBatch("xlsx");

    await runBillingExport({ exportBatchId: batchId, actorUserId: actorId });

    const batch = (await db.select().from(exportBatches).where(eq(exportBatches.id, batchId)).limit(1))[0]!;
    expect(batch.status).toBe("completed");
    expect(batch.tripCount).toBe(1);
    expect(Number(batch.totalAmountCents)).toBe(160_000);
    expect(batch.fileStorageKey).not.toBeNull();

    const trip = (await db.select({ s: trips.currentStatus }).from(trips).where(eq(trips.id, tripId)).limit(1))[0]!;
    expect(trip.s).toBe("billed");
    const item = (await db.select({ ex: billingItems.exportBatchId }).from(billingItems).where(eq(billingItems.tripId, tripId)).limit(1))[0]!;
    expect(item.ex).toBe(batchId);
  });

  it("csv: completes the batch with a stored file", async () => {
    await seedReadyTrip();
    const batchId = await insertBatch("csv");
    await runBillingExport({ exportBatchId: batchId, actorUserId: actorId });
    const batch = (await db.select().from(exportBatches).where(eq(exportBatches.id, batchId)).limit(1))[0]!;
    expect(batch.status).toBe("completed");
    expect(batch.fileStorageKey).not.toBeNull();
  });

  it("idempotent retry does not double-bill AND keeps the billed trip in the file/totals", async () => {
    const tripId = await seedReadyTrip({ adjustment: 10_000 }); // final 160_000
    const batchId = await insertBatch("xlsx");
    await runBillingExport({ exportBatchId: batchId, actorUserId: actorId });
    // Re-run the same batch: the trip is now 'billed' but stays LINKED, so it is re-included (not zeroed).
    await runBillingExport({ exportBatchId: batchId, actorUserId: actorId });

    const trip = (await db.select({ s: trips.currentStatus }).from(trips).where(eq(trips.id, tripId)).limit(1))[0]!;
    expect(trip.s).toBe("billed");
    const billedEvents = await db
      .select({ id: tripEvents.id })
      .from(tripEvents)
      .where(and(eq(tripEvents.tripId, tripId), eq(tripEvents.statusAfter, "billed")));
    expect(billedEvents.length).toBe(1); // transitioned to billed exactly once

    // The retry did NOT drop the billed trip from the batch (the FR-021 / P1 regression guard).
    const batch = (await db.select().from(exportBatches).where(eq(exportBatches.id, batchId)).limit(1))[0]!;
    expect(batch.tripCount).toBe(1);
    expect(Number(batch.totalAmountCents)).toBe(160_000);
  });

  it("a partial prior run is completed: an already-billed+linked trip is re-included alongside a new billing_ready one", async () => {
    const batchId = await insertBatch("xlsx");
    // Simulate a prior partial run: trip A is already billed and linked to this batch.
    const tripA = await seedReadyTrip();
    await db.update(trips).set({ currentStatus: "billed" }).where(eq(trips.id, tripA));
    await db.update(billingItems).set({ exportBatchId: batchId }).where(eq(billingItems.tripId, tripA));
    // Trip C is still billing_ready for the same customer+period.
    const tripC = await seedReadyTrip();

    await runBillingExport({ exportBatchId: batchId, actorUserId: actorId });

    const batch = (await db.select().from(exportBatches).where(eq(exportBatches.id, batchId)).limit(1))[0]!;
    expect(batch.status).toBe("completed");
    expect(batch.tripCount).toBe(2); // BOTH trips are in the file/totals
    expect(Number(batch.totalAmountCents)).toBe(300_000);

    const cStatus = (await db.select({ s: trips.currentStatus }).from(trips).where(eq(trips.id, tripC)).limit(1))[0]!;
    expect(cStatus.s).toBe("billed"); // the new one was billed
    const aStatus = (await db.select({ s: trips.currentStatus }).from(trips).where(eq(trips.id, tripA)).limit(1))[0]!;
    expect(aStatus.s).toBe("billed"); // the prior one stays billed (not double-transitioned)
    const aLink = (await db.select({ ex: billingItems.exportBatchId }).from(billingItems).where(eq(billingItems.tripId, tripA)).limit(1))[0]!;
    expect(aLink.ex).toBe(batchId);
  });

  it("a billing_ready trip already LINKED (prior link-without-transition) is billed on retry, not dropped", async () => {
    const batchId = await insertBatch("xlsx");
    // Simulate the link-first / transition-failed intermediate state: linked but still billing_ready.
    const tripId = await seedReadyTrip();
    await db.update(billingItems).set({ exportBatchId: batchId }).where(eq(billingItems.tripId, tripId));

    await runBillingExport({ exportBatchId: batchId, actorUserId: actorId });

    const trip = (await db.select({ s: trips.currentStatus }).from(trips).where(eq(trips.id, tripId)).limit(1))[0]!;
    expect(trip.s).toBe("billed"); // re-included by both arms + transitioned (never dropped)
    const batch = (await db.select().from(exportBatches).where(eq(exportBatches.id, batchId)).limit(1))[0]!;
    expect(batch.status).toBe("completed");
    expect(batch.tripCount).toBe(1);
  });

  it("a trip linked but DISPUTED (race: moved out of billing_ready) is unlinked + excluded, not exported", async () => {
    const batchId = await insertBatch("xlsx");
    // Simulate the disputed-mid-export race: trip D was linked, then another actor disputed it.
    const tripD = await seedReadyTrip();
    await db.update(trips).set({ currentStatus: "disputed", disputedFromStatus: "billing_ready" }).where(eq(trips.id, tripD));
    await db.update(billingItems).set({ exportBatchId: batchId }).where(eq(billingItems.tripId, tripD));
    // Trip E is a normal billing_ready trip for the same batch.
    const tripE = await seedReadyTrip();

    await runBillingExport({ exportBatchId: batchId, actorUserId: actorId });

    const batch = (await db.select().from(exportBatches).where(eq(exportBatches.id, batchId)).limit(1))[0]!;
    expect(batch.status).toBe("completed");
    expect(batch.tripCount).toBe(1); // ONLY the legitimately-billed trip E

    // Trip D is reconciled OUT: unlinked + left disputed (never billed, never in the export).
    const dRow = (await db.select({ s: trips.currentStatus, ex: billingItems.exportBatchId }).from(trips).innerJoin(billingItems, eq(billingItems.tripId, trips.id)).where(eq(trips.id, tripD)).limit(1))[0]!;
    expect(dRow.s).toBe("disputed");
    expect(dRow.ex).toBeNull();
    // Trip E is billed + linked.
    const eRow = (await db.select({ s: trips.currentStatus, ex: billingItems.exportBatchId }).from(trips).innerJoin(billingItems, eq(billingItems.tripId, trips.id)).where(eq(trips.id, tripE)).limit(1))[0]!;
    expect(eRow.s).toBe("billed");
    expect(eRow.ex).toBe(batchId);
  });
});
