import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import type { PortalTrip } from "@brazil-tms/shared";
import {
  applyPortalPlanTrip,
  auditLogs,
  customers,
  db,
  linkStationIds,
  loadStationMap,
  locations,
  tripEvents,
  trips,
  users,
} from "@brazil-tms/db";

/**
 * The PLAN taken from the portal — the half that lets the hand-typed spreadsheet be switched off.
 * What matters is that it creates the movement the file states, keeps the lifecycle of trips that
 * already exist, and stays quiet when it has nothing to change. Skips without DATABASE_URL.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("applyPortalPlanTrip (integration)", () => {
  let actorId = "";
  let customerId = "";
  let originId = "";
  let destId = "";
  let midId = "";
  const tripIds: string[] = [];

  const uniq = (p: string): string => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  /** A two-stop trip as the "Planejado" tab states it: windows, no real times yet. */
  const planned = (externalTripId: string, over: Partial<PortalTrip> = {}): PortalTrip => ({
    externalTripId,
    tripName: "20260812Adhoc",
    status: "Assigning",
    driverLabel: null,
    vehicleLabel: "CARRETA - EXPRESSA",
    plateLabel: null,
    stops: [],
    legs: [
      {
        legNumber: 1,
        origin: {
          sequence: 1,
          stationValue: "[910001]Origem",
          stationId: "910001",
          stationName: "Origem",
          plannedArrival: "20/08/2026 08:00",
          plannedDeparture: "20/08/2026 09:30",
          actualArrival: null,
          actualDeparture: null,
        },
        destination: {
          sequence: 2,
          stationValue: "[910002]Destino",
          stationId: "910002",
          stationName: "Destino",
          plannedArrival: "20/08/2026 18:00",
          plannedDeparture: null,
          actualArrival: null,
          actualDeparture: null,
        },
      },
    ],
    ...over,
  });

  beforeAll(async () => {
    actorId = (await db.select({ id: users.id }).from(users).limit(1))[0]?.id ?? "";
    expect(actorId).not.toBe("");

    customerId = (
      await db
        .insert(customers)
        .values({ name: "Cliente plano portal", customerCode: uniq("CUST-PLAN") })
        .returning({ id: customers.id })
    )[0]!.id;

    const codes = [uniq("ORIG"), uniq("DEST"), uniq("MID")];
    const inserted = await db
      .insert(locations)
      .values(codes.map((code, i) => ({ customerId, code, name: `Site ${i}` })))
      .returning({ id: locations.id });
    originId = inserted[0]!.id;
    destId = inserted[1]!.id;
    midId = inserted[2]!.id;

    const { linked } = await linkStationIds(customerId, [
      { stationId: "910001", code: codes[0]! },
      { stationId: "910002", code: codes[1]! },
      { stationId: "910003", code: codes[2]! },
    ]);
    expect(linked).toBe(3);
  });

  afterAll(async () => {
    const created = await db
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.customerId, customerId));
    const ids = [...new Set([...tripIds, ...created.map((t) => t.id)])];
    if (ids.length) {
      await db.delete(tripEvents).where(inArray(tripEvents.tripId, ids));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, ids));
      await db.delete(trips).where(inArray(trips.id, ids));
    }
    for (const id of [originId, destId, midId]) {
      if (id) await db.delete(locations).where(eq(locations.id, id));
    }
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  });

  it("creates the trip the portal plans, with its windows and vehicle", async () => {
    const ext = uniq("LH-PLAN");
    const map = await loadStationMap(customerId);
    const { outcomes } = await applyPortalPlanTrip(
      customerId,
      planned(ext),
      map,
      actorId,
      "planejado.csv",
    );
    expect(outcomes[0]!.status).toBe("created");

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    tripIds.push(trip.id);
    expect(trip.currentStatus).toBe("received");
    expect(trip.originLocationId).toBe(originId);
    expect(trip.destinationLocationId).toBe(destId);
    // 08:00 in São Paulo is 11:00Z.
    expect(trip.plannedPickupWindowStart?.toISOString()).toBe("2026-08-20T11:00:00.000Z");
    expect(trip.plannedDeliveryWindowStart?.toISOString()).toBe("2026-08-20T21:00:00.000Z");
    // "CARRETA - EXPRESSA" is a commercial arrangement, not a vehicle: it is a carreta.
    expect(trip.plannedVehicleType).toBe("carreta");
  });

  it("writes NOTHING the second time — the plan already says exactly this", async () => {
    const ext = uniq("LH-SAME");
    const map = await loadStationMap(customerId);
    await applyPortalPlanTrip(customerId, planned(ext), map, actorId, "planejado.csv");
    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    tripIds.push(trip.id);
    const before = await db.select().from(auditLogs).where(eq(auditLogs.entityId, trip.id));

    const { outcomes } = await applyPortalPlanTrip(
      customerId,
      planned(ext),
      map,
      actorId,
      "planejado.csv",
    );
    expect(outcomes[0]!.status).toBe("unchanged");
    const after = await db.select().from(auditLogs).where(eq(auditLogs.entityId, trip.id));
    expect(after.length).toBe(before.length);
  });

  it("updates the plan of a trip it already has, WITHOUT touching its lifecycle", async () => {
    const ext = uniq("LH-UPD");
    const map = await loadStationMap(customerId);
    await applyPortalPlanTrip(customerId, planned(ext), map, actorId, "planejado.csv");
    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    tripIds.push(trip.id);
    await db.update(trips).set({ currentStatus: "assigned" }).where(eq(trips.id, trip.id));

    const moved = planned(ext);
    // Remarcado para MAIS CEDO: mover só a chegada para depois da saída (09:30) inverteria a
    // janela, e o serviço recusa — que é o comportamento certo, e não o que este caso testa.
    moved.legs[0]!.origin.plannedArrival = "20/08/2026 08:30";
    const { outcomes } = await applyPortalPlanTrip(
      customerId,
      moved,
      map,
      actorId,
      "planejado.csv",
    );
    expect(outcomes[0]!.status).toBe("updated");

    const after = (await db.select().from(trips).where(eq(trips.id, trip.id)).limit(1))[0]!;
    expect(after.plannedPickupWindowStart?.toISOString()).toBe("2026-08-20T11:30:00.000Z");
    expect(after.currentStatus).toBe("assigned"); // o plano mudou, o ciclo de vida não
  });

  it("creates a trip the portal reports Cancelled already cancelled, for consultation", async () => {
    const ext = uniq("LH-CANC");
    const map = await loadStationMap(customerId);
    const { outcomes } = await applyPortalPlanTrip(
      customerId,
      planned(ext, { status: "Cancelled" }),
      map,
      actorId,
      "planejado.csv",
    );
    expect(outcomes[0]!.status).toBe("cancelled");

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    tripIds.push(trip.id);
    expect(trip.currentStatus).toBe("cancelled");
    expect(trip.cancelledAt).not.toBeNull();
  });

  it("splits a three-stop trip into two trips, one per movement", async () => {
    const ext = uniq("LH-MILK");
    const map = await loadStationMap(customerId);
    const milk = planned(ext);
    milk.legs.push({
      legNumber: 2,
      origin: milk.legs[0]!.destination,
      destination: {
        sequence: 3,
        stationValue: "[910003]Meio",
        stationId: "910003",
        stationName: "Meio",
        plannedArrival: "21/08/2026 06:00",
        plannedDeparture: null,
        actualArrival: null,
        actualDeparture: null,
      },
    });

    const { outcomes } = await applyPortalPlanTrip(customerId, milk, map, actorId, "planejado.csv");
    expect(outcomes.map((o) => o.status)).toEqual(["created", "created"]);

    const created = await db.select().from(trips).where(eq(trips.externalTripId, ext));
    for (const t of created) tripIds.push(t.id);
    expect(created).toHaveLength(2);
    expect(created.map((t) => t.legNumber).sort()).toEqual([1, 2]);
  });

  it("reports an unresolved station instead of creating a trip to nowhere", async () => {
    const ext = uniq("LH-NOSTATION");
    const map = await loadStationMap(customerId);
    const bad = planned(ext);
    bad.legs[0]!.destination.stationId = "999999";
    const { outcomes } = await applyPortalPlanTrip(customerId, bad, map, actorId, "planejado.csv");
    expect(outcomes[0]!.status).toBe("unknown_station");
    expect(await db.select().from(trips).where(eq(trips.externalTripId, ext))).toHaveLength(0);
  });
});
