import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { auditLogs, customers, db, locations, tripEvents, trips, users } from "@brazil-tms/db";
import { closeTripFromSource, isClosedAtSource } from "./close-at-source";

/**
 * Closing a trip because the CUSTOMER's file says it is over.
 *
 * The label match is pure and always runs. The closing itself touches the DB, so it skips without
 * DATABASE_URL (same convention as the other worker integration tests):
 *   $env:DATABASE_URL='postgres://...'; pnpm exec vitest run --project workers
 */

describe("isClosedAtSource", () => {
  const labels = ["FINALIZADA", "CANCELADA", "NO SHOW", "INFRUTÍFERA"];

  it("matches ignoring case and accents (the file types it both ways)", () => {
    expect(isClosedAtSource("finalizada", labels)).toBe(true);
    expect(isClosedAtSource("INFRUTIFERA", labels)).toBe(true);
    expect(isClosedAtSource("  No Show ", labels)).toBe(true);
  });

  it("leaves a live trip alone", () => {
    expect(isClosedAtSource("EM VIAGEM", labels)).toBe(false);
    expect(isClosedAtSource("FALTA ATRIBUIR", labels)).toBe(false);
    expect(isClosedAtSource("", labels)).toBe(false);
    expect(isClosedAtSource(null, labels)).toBe(false);
  });

  it("does nothing when the template configures no labels (every other customer)", () => {
    expect(isClosedAtSource("FINALIZADA", [])).toBe(false);
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("closeTripFromSource (integration)", () => {
  let customerId = "";
  let originId = "";
  let destId = "";
  let actorId = "";
  const tripIds: string[] = [];

  const code = (p: string): string => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function makeTrip(): Promise<string> {
    const inserted = await db
      .insert(trips)
      .values({
        customerId,
        originLocationId: originId,
        destinationLocationId: destId,
        originalPlan: {},
        currentStatus: "received",
      })
      .returning({ id: trips.id });
    const id = inserted[0]!.id;
    tripIds.push(id);
    return id;
  }

  beforeAll(async () => {
    const actor = await db.select({ id: users.id }).from(users).limit(1);
    actorId = actor[0]?.id ?? "";
    expect(actorId, "a seeded user must exist (run db:seed:e2e)").not.toBe("");

    const cust = await db
      .insert(customers)
      .values({ name: "Cliente fechamento", customerCode: code("CUST") })
      .returning({ id: customers.id });
    customerId = cust[0]!.id;
    const origin = await db
      .insert(locations)
      .values({ customerId, code: code("ORIG"), name: "Origem" })
      .returning({ id: locations.id });
    originId = origin[0]!.id;
    const dest = await db
      .insert(locations)
      .values({ customerId, code: code("DEST"), name: "Destino" })
      .returning({ id: locations.id });
    destId = dest[0]!.id;
  });

  afterAll(async () => {
    if (tripIds.length) {
      await db.delete(tripEvents).where(inArray(tripEvents.tripId, tripIds));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, tripIds));
      await db.delete(trips).where(inArray(trips.id, tripIds));
    }
    if (originId) await db.delete(locations).where(eq(locations.id, originId));
    if (destId) await db.delete(locations).where(eq(locations.id, destId));
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  });

  it("completes a trip the file reports FINALIZADA, walking only declared transitions", async () => {
    const tripId = await makeTrip();
    expect(await closeTripFromSource(tripId, "FINALIZADA", actorId, "arquivo.xlsx")).toBe("closed");

    const row = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    expect(row[0]?.currentStatus).toBe("completed");

    // Every hop is recorded, sourced `import`, with NO invented milestone time.
    const events = await db.select().from(tripEvents).where(eq(tripEvents.tripId, tripId));
    expect(events.length).toBeGreaterThan(1);
    expect(events.every((e) => e.source === "import")).toBe(true);
    expect(events.every((e) => e.eventTimestamp === null)).toBe(true);
    expect(events[0]?.notes).toContain("Encerrada na origem");
    // …and the chain starts where the trip was and ends where the customer says it is.
    expect(events.some((e) => e.statusBefore === "received")).toBe(true);
    expect(events.some((e) => e.statusAfter === "completed")).toBe(true);

    const audit = await db.select().from(auditLogs).where(eq(auditLogs.entityId, tripId));
    expect(audit[0]?.action).toBe("trip.status_change");
    expect(audit[0]?.reason).toContain("FINALIZADA");
  });

  it("cancels — with the customer's own reason code — when the label is a cancellation", async () => {
    const tripId = await makeTrip();
    expect(await closeTripFromSource(tripId, "NO SHOW", actorId, "arquivo.xlsx")).toBe("closed");

    const row = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    expect(row[0]?.currentStatus).toBe("cancelled");
    expect(row[0]?.cancellationReasonCode).toBe("NO_SHOW");
    expect(row[0]?.cancelledAt).not.toBeNull();
  });

  it("is idempotent: a trip already closed is left exactly as it is", async () => {
    const tripId = await makeTrip();
    await closeTripFromSource(tripId, "FINALIZADA", actorId, "arquivo.xlsx");
    const eventsAfterFirst = await db
      .select()
      .from(tripEvents)
      .where(eq(tripEvents.tripId, tripId));

    expect(await closeTripFromSource(tripId, "FINALIZADA", actorId, "arquivo.xlsx")).toBe(
      "already_closed",
    );
    const eventsAfterSecond = await db
      .select()
      .from(tripEvents)
      .where(eq(tripEvents.tripId, tripId));
    expect(eventsAfterSecond.length).toBe(eventsAfterFirst.length);
  });
});
