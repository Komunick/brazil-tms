import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  customers,
  db,
  locations,
  trips,
  updateOperationalFields,
  users,
} from "@brazil-tms/db";

/**
 * The operation's own annotations (2026-08-15). These five fields exist to take the place of a
 * hand-maintained spreadsheet, so the properties that matter are: a person's entry survives, only
 * what changed is written, and every change is attributable. Skips without DATABASE_URL.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("updateOperationalFields (integration)", () => {
  let actorId = "";
  let customerId = "";
  let originId = "";
  let destId = "";
  const tripIds: string[] = [];

  const uniq = (p: string): string => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function makeTrip(status = "received"): Promise<string> {
    const inserted = await db
      .insert(trips)
      .values({
        customerId,
        originLocationId: originId,
        destinationLocationId: destId,
        originalPlan: {},
        currentStatus: status as "received",
      })
      .returning({ id: trips.id });
    const id = inserted[0]!.id;
    tripIds.push(id);
    return id;
  }

  beforeAll(async () => {
    const admin = await db.select({ id: users.id }).from(users).limit(1);
    actorId = admin[0]?.id ?? "";
    expect(actorId, "a seeded user must exist").not.toBe("");

    const c = await db
      .insert(customers)
      .values({ name: "Cliente campos", customerCode: uniq("CUST-OP") })
      .returning({ id: customers.id });
    customerId = c[0]!.id;
    const o = await db
      .insert(locations)
      .values({ customerId, code: uniq("ORIG"), name: "Origem" })
      .returning({ id: locations.id });
    originId = o[0]!.id;
    const d = await db
      .insert(locations)
      .values({ customerId, code: uniq("DEST"), name: "Destino" })
      .returning({ id: locations.id });
    destId = d[0]!.id;
  });

  afterAll(async () => {
    if (tripIds.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, tripIds));
      await db.delete(trips).where(inArray(trips.id, tripIds));
    }
    if (originId) await db.delete(locations).where(eq(locations.id, originId));
    if (destId) await db.delete(locations).where(eq(locations.id, destId));
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  });

  it("saves what was typed and records who typed it", async () => {
    const tripId = await makeTrip();
    await updateOperationalFields(tripId, { smRaster: "SM-99812", cte: "35260812" }, actorId);

    const row = (await db.select().from(trips).where(eq(trips.id, tripId)).limit(1))[0]!;
    expect(row.operationalFields).toEqual({ smRaster: "SM-99812", cte: "35260812" });

    const audit = await db.select().from(auditLogs).where(eq(auditLogs.entityId, tripId));
    const entry = audit.find((a) => a.action === "trip.fields_update")!;
    expect(entry.actorUserId).toBe(actorId);
    expect(entry.newValue).toEqual({ smRaster: "SM-99812", cte: "35260812" });
    expect(entry.previousValue).toEqual({ smRaster: null, cte: null });
  });

  it("touches ONLY the fields sent — an untouched one is not rewritten", async () => {
    const tripId = await makeTrip();
    await updateOperationalFields(tripId, { smRaster: "SM-1", doca: "12" }, actorId);
    await updateOperationalFields(tripId, { doca: "13" }, actorId);

    const row = (await db.select().from(trips).where(eq(trips.id, tripId)).limit(1))[0]!;
    expect(row.operationalFields).toEqual({ smRaster: "SM-1", doca: "13" });
  });

  it("clears a field with an empty value, and leaves nothing behind when the last one goes", async () => {
    const tripId = await makeTrip();
    await updateOperationalFields(tripId, { checklist: "OK" }, actorId);
    await updateOperationalFields(tripId, { checklist: null }, actorId);

    const row = (await db.select().from(trips).where(eq(trips.id, tripId)).limit(1))[0]!;
    expect(row.operationalFields).toBeNull();
  });

  it("writes no audit row when nothing actually changed (re-saving a form is not an event)", async () => {
    const tripId = await makeTrip();
    await updateOperationalFields(tripId, { solicitacao: "SOL-7" }, actorId);
    const before = await db.select().from(auditLogs).where(eq(auditLogs.entityId, tripId));

    await updateOperationalFields(tripId, { solicitacao: "SOL-7" }, actorId);
    const after = await db.select().from(auditLogs).where(eq(auditLogs.entityId, tripId));
    expect(after.length).toBe(before.length);
  });

  it("refuses once the trip is closed — nothing is annotated after billing", async () => {
    const tripId = await makeTrip("cancelled");
    await expect(updateOperationalFields(tripId, { cte: "x" }, actorId)).rejects.toMatchObject({
      code: "TRIP_CLOSED",
    });
  });

  it("is editable AFTER confirmation — the CT-e is normally filled in once the truck rolls", async () => {
    const tripId = await makeTrip("in_transit");
    const detail = await updateOperationalFields(tripId, { cte: "35260899" }, actorId);
    expect(detail.id).toBe(tripId);
    const row = (await db.select().from(trips).where(eq(trips.id, tripId)).limit(1))[0]!;
    expect(row.operationalFields).toEqual({ cte: "35260899" });
  });
});
