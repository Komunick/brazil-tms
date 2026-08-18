import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { TripStatus } from "@brazil-tms/shared";
import {
  alerts,
  auditLogs,
  customers,
  db,
  drivers,
  locations,
  tripAssignments,
  tripEvents,
  trips,
  users,
} from "@brazil-tms/db";
import { advanceTripFromSource, closeTripFromSource, isClosedAtSource } from "@brazil-tms/db";

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
      await db.delete(alerts).where(inArray(alerts.tripId, tripIds));
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

  it("apaga os alertas da viagem ao encerrá-la — cancelada não alerta", async () => {
    // No tmsdev, 12 alertas viviam em viagens canceladas: "sem atribuição na janela" numa viagem que
    // não vai acontecer. Ninguém consegue resolver isso, então fica no painel para sempre. Cancelar
    // pela mão de uma pessoa já limpava; cancelar pelo import — que é como quase todo cancelamento
    // chega aqui — não limpava.
    const tripId = await makeTrip();
    await db.insert(alerts).values({
      tripId,
      alertCase: "unassigned_within_window",
      severity: "medium",
      state: "active",
    });

    expect(await closeTripFromSource(tripId, "CANCELADA", actorId, "portal")).toBe("closed");

    const abertos = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.tripId, tripId), inArray(alerts.state, ["active", "acknowledged"])));
    expect(abertos).toHaveLength(0);
    // O alerta não some do banco: é resolvido, e a história permanece.
    const todos = await db.select().from(alerts).where(eq(alerts.tripId, tripId));
    expect(todos).toHaveLength(1);
    expect(todos[0]!.state).toBe("resolved");
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

/**
 * Advancing a trip because the customer's file says where it IS ("EM VIAGEM" while the TMS still
 * shows "Atribuída"). The guards matter more than the happy path: the file may move a trip along
 * the lifecycle, never back up it, and never into a state that implies a driver it does not have.
 */
describe.skipIf(!hasDb)("advanceTripFromSource (integration)", () => {
  let customerId = "";
  let originId = "";
  let destId = "";
  let actorId = "";
  let driverId = "";
  const tripIds: string[] = [];
  const assignmentIds: string[] = [];

  const code = (p: string): string => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function makeTrip(status: TripStatus = "received"): Promise<string> {
    const inserted = await db
      .insert(trips)
      .values({
        customerId,
        originLocationId: originId,
        destinationLocationId: destId,
        originalPlan: {},
        currentStatus: status,
      })
      .returning({ id: trips.id });
    const id = inserted[0]!.id;
    tripIds.push(id);
    return id;
  }

  /** The trip has a driver — what makes "underway" an honest thing to record. */
  async function assign(tripId: string): Promise<void> {
    const inserted = await db
      .insert(tripAssignments)
      .values({ tripId, driverId, assignedByUserId: actorId })
      .returning({ id: tripAssignments.id });
    assignmentIds.push(inserted[0]!.id);
  }

  beforeAll(async () => {
    const actor = await db.select({ id: users.id }).from(users).limit(1);
    actorId = actor[0]?.id ?? "";
    expect(actorId, "a seeded user must exist (run db:seed:e2e)").not.toBe("");

    const cust = await db
      .insert(customers)
      .values({ name: "Cliente status", customerCode: code("CUST") })
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
    const driver = await db
      .insert(drivers)
      .values({ name: "Motorista status", ownershipType: "owned" })
      .returning({ id: drivers.id });
    driverId = driver[0]!.id;
  });

  afterAll(async () => {
    if (assignmentIds.length) {
      await db.delete(tripAssignments).where(inArray(tripAssignments.id, assignmentIds));
    }
    if (tripIds.length) {
      await db.delete(alerts).where(inArray(alerts.tripId, tripIds));
      await db.delete(tripEvents).where(inArray(tripEvents.tripId, tripIds));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, tripIds));
      await db.delete(trips).where(inArray(trips.id, tripIds));
    }
    if (driverId) await db.delete(drivers).where(eq(drivers.id, driverId));
    if (originId) await db.delete(locations).where(eq(locations.id, originId));
    if (destId) await db.delete(locations).where(eq(locations.id, destId));
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  });

  it("moves an assigned trip to in_transit through every declared intermediate state", async () => {
    const tripId = await makeTrip("assigned");
    await assign(tripId);
    expect(
      await advanceTripFromSource(tripId, "in_transit", "EM VIAGEM", actorId, "arquivo.xlsx"),
    ).toBe("advanced");

    const row = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    expect(row[0]?.currentStatus).toBe("in_transit");

    // No teleporting: confirmed and at_origin are recorded on the way, sourced `import`, untimed.
    const events = await db.select().from(tripEvents).where(eq(tripEvents.tripId, tripId));
    const reached = events.map((e) => e.statusAfter);
    expect(reached).toContain("confirmed");
    expect(reached).toContain("at_origin");
    expect(reached).toContain("in_transit");
    expect(events.every((e) => e.source === "import" && e.eventTimestamp === null)).toBe(true);
    expect(events[0]?.notes).toContain("EM VIAGEM");
  });

  it("REFUSES to move a trip backwards — the file is stale, the team here is not", async () => {
    const tripId = await makeTrip("in_transit");
    await assign(tripId);
    expect(
      await advanceTripFromSource(tripId, "assigned", "ATRIBUÍDO NO SPX", actorId, "arquivo.xlsx"),
    ).toBe("backwards");

    const row = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    expect(row[0]?.currentStatus).toBe("in_transit");
    const events = await db.select().from(tripEvents).where(eq(tripEvents.tripId, tripId));
    expect(events).toHaveLength(0);
  });

  it("REFUSES to put a trip on the road with nobody driving it", async () => {
    const tripId = await makeTrip("received"); // no assignment
    expect(
      await advanceTripFromSource(tripId, "in_transit", "EM VIAGEM", actorId, "arquivo.xlsx"),
    ).toBe("no_resource");

    const row = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    expect(row[0]?.currentStatus).toBe("received");
  });

  it("leaves a closed trip alone, and does nothing when it is already there", async () => {
    const done = await makeTrip("completed");
    expect(
      await advanceTripFromSource(done, "in_transit", "EM VIAGEM", actorId, "arquivo.xlsx"),
    ).toBe("terminal");

    const same = await makeTrip("assigned");
    await assign(same);
    expect(
      await advanceTripFromSource(same, "assigned", "ATRIBUÍDO NO SPX", actorId, "arquivo.xlsx"),
    ).toBe("already_there");
    const events = await db.select().from(tripEvents).where(eq(tripEvents.tripId, same));
    expect(events).toHaveLength(0);
  });
});
