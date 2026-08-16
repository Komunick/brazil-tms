import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  customers,
  db,
  importBatches,
  lanes,
  linkStationIds,
  locations,
  tripEvents,
  trips,
  users,
} from "@brazil-tms/db";
import { ingestPortalFeed } from "./portal-feed";

/**
 * The robot's path end to end: the portal's own API payload → trips, milestones and a history line.
 *
 * Fixtures are invented. The live payload carries drivers' real names; none of it is copied here.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

const HORA = 3600;
const NOVE = Math.floor(Date.UTC(2026, 7, 13, 12, 0, 0) / 1000);

describe.skipIf(!hasDb)("portal feed (integration)", () => {
  let customerId = "";
  let customerCode = "";
  let actorEmail = "";
  const token = `PF${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const createdBatchIds: string[] = [];

  beforeAll(async () => {
    customerCode = `FEED-${token}`;
    customerId = (
      await db
        .insert(customers)
        .values({ name: `Cliente feed ${token}`, customerCode })
        .returning({ id: customers.id })
    )[0]!.id;

    const locs = await db
      .insert(locations)
      .values([
        { customerId, code: `FO-${token}`, name: "Origem feed" },
        { customerId, code: `FD-${token}`, name: "Destino feed" },
      ])
      .returning({ id: locations.id });
    // The reconciliation the whole portal path depends on: the customer's station id → our location.
    await linkStationIds(customerId, [
      { stationId: "910001", code: `FO-${token}` },
      { stationId: "910002", code: `FD-${token}` },
    ]);
    expect(locs).toHaveLength(2);

    const admin = (
      await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.email, "admin@braziltransports.com.br"))
        .limit(1)
    )[0];
    actorEmail = admin!.email;
    process.env.PORTAL_FEED_ACTOR_EMAIL = actorEmail;
  });

  afterAll(async () => {
    const seeded = await db
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.customerId, customerId));
    const ids = seeded.map((t) => t.id);
    if (ids.length) {
      await db.delete(tripEvents).where(inArray(tripEvents.tripId, ids));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, ids));
      await db.delete(trips).where(inArray(trips.id, ids));
    }
    if (createdBatchIds.length) {
      await db.delete(importBatches).where(inArray(importBatches.id, createdBatchIds));
    }
    await db.delete(lanes).where(eq(lanes.customerId, customerId));
    await db.delete(locations).where(eq(locations.customerId, customerId));
    await db.delete(auditLogs).where(eq(auditLogs.entityId, customerId));
    await db.delete(customers).where(eq(customers.id, customerId));
  });

  function payload(over: Record<string, unknown> = {}) {
    return {
      retcode: 0,
      data: {
        total: 1,
        list: [
          {
            trip_number: `LH-${token}`,
            trip_status: 4,
            vehicle_type_name: "CARRETA",
            driver_name: "Fulano de Tal",
            vehicle_number: "ABC1D23",
            trip_station: [
              {
                sequence_number: 1,
                station: 910001,
                station_name: "Origem feed",
                sta: NOVE,
                std: NOVE + HORA,
                ata: 0,
                atd: 0,
              },
              {
                sequence_number: 2,
                station: 910002,
                station_name: "Destino feed",
                sta: NOVE + 7 * HORA,
                std: 0,
                ata: 0,
                atd: 0,
              },
            ],
            ...over,
          },
        ],
      },
    };
  }

  it("creates the trip the portal plans, from the API payload alone", async () => {
    const r = await ingestPortalFeed({ payload: payload(), mode: "plan", customerCode });
    if (r.batchId) createdBatchIds.push(r.batchId);

    expect(r.planSummary?.created).toBe(1);
    expect(r.unknownStations).toEqual([]);

    const trip = (
      await db
        .select()
        .from(trips)
        .where(eq(trips.externalTripId, `LH-${token}`))
        .limit(1)
    )[0]!;
    expect(trip.currentStatus).toBe("received");
    expect(trip.plannedPickupWindowStart?.toISOString()).toBe("2026-08-13T12:00:00.000Z");
    // The lane was registered on the way in, like any other create path.
    expect(trip.laneId).not.toBeNull();
  });

  it("a second identical poll changes nothing AND writes no history line", async () => {
    // The property that makes a 5-minute robot bearable: quiet runs stay invisible.
    const r = await ingestPortalFeed({ payload: payload(), mode: "plan", customerCode });
    expect(r.planSummary?.unchanged).toBe(1);
    expect(r.planSummary?.created).toBe(0);
    expect(r.batchId).toBeNull();
  });

  it("records the real milestones when the portal reports movement", async () => {
    const movida = payload({
      trip_status: 90,
      trip_station: [
        {
          sequence_number: 1,
          station: 910001,
          station_name: "Origem feed",
          sta: NOVE,
          std: NOVE + HORA,
          ata: NOVE + 10 * 60,
          atd: NOVE + HORA,
        },
        {
          sequence_number: 2,
          station: 910002,
          station_name: "Destino feed",
          sta: NOVE + 7 * HORA,
          std: 0,
          ata: NOVE + 7 * HORA,
          atd: 0,
        },
      ],
    });
    const r = await ingestPortalFeed({ payload: movida, mode: "execution", customerCode });
    if (r.batchId) createdBatchIds.push(r.batchId);
    expect(r.summary?.applied).toBe(1);
    expect(r.batchId).not.toBeNull();

    const trip = (
      await db
        .select()
        .from(trips)
        .where(eq(trips.externalTripId, `LH-${token}`))
        .limit(1)
    )[0]!;
    const eventos = await db.select().from(tripEvents).where(eq(tripEvents.tripId, trip.id));
    const tipos = eventos.map((e) => e.eventType);
    expect(tipos).toContain("origin_arrived");
    expect(tipos).toContain("departed");
    expect(tipos).toContain("destination_arrived");
    // The instant is the customer's, not ours.
    const chegada = eventos.find((e) => e.eventType === "origin_arrived")!;
    expect(chegada.eventTimestamp?.toISOString()).toBe("2026-08-13T12:10:00.000Z");
  });

  it("records the loading steps the portal times, not just arrival and departure", async () => {
    // The timeline the customer's own screen shows: chegou 05:04, começou a carregar 06:50,
    // carregado 07:16, partiu 07:16. The TMS used to jump straight from at_origin to in_transit.
    const ext = `LH-CARGA-${token}`;
    const comCarregamento = payload({
      trip_number: ext,
      trip_status: 90,
      trip_station: [
        {
          sequence_number: 1,
          station: 910001,
          station_name: "Origem feed",
          sta: NOVE,
          std: NOVE + 2 * HORA,
          ata: NOVE + 10 * 60,
          loading_time: NOVE + HORA,
          loaded_time: NOVE + 2 * HORA - 15 * 60,
          atd: NOVE + 2 * HORA,
        },
        {
          sequence_number: 2,
          station: 910002,
          station_name: "Destino feed",
          sta: NOVE + 9 * HORA,
          std: 0,
          ata: NOVE + 9 * HORA,
          atd: 0,
        },
      ],
    });

    const plano = await ingestPortalFeed({ payload: comCarregamento, mode: "plan", customerCode });
    if (plano.batchId) createdBatchIds.push(plano.batchId);
    const exec = await ingestPortalFeed({
      payload: comCarregamento,
      mode: "execution",
      customerCode,
    });
    if (exec.batchId) createdBatchIds.push(exec.batchId);

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    const eventos = await db
      .select()
      .from(tripEvents)
      .where(eq(tripEvents.tripId, trip.id))
      .orderBy(tripEvents.eventTimestamp);

    const percorrido = eventos
      .filter((e) => e.eventType === "status_change" && e.statusAfter)
      .map((e) => e.statusAfter);
    expect(percorrido).toContain("loading");
    expect(percorrido).toContain("loaded");
    expect(percorrido).toContain("in_transit");

    const carregando = eventos.find(
      (e) => e.eventType === "status_change" && e.statusAfter === "loading",
    )!;
    expect(carregando.eventTimestamp?.toISOString()).toBe("2026-08-13T13:00:00.000Z");
    // `loaded` also earns its own typed event, since the vocabulary has one.
    expect(eventos.some((e) => e.eventType === "loaded")).toBe(true);
  });

  it("refuses a portal error page instead of reading it as a quiet day", async () => {
    await expect(
      ingestPortalFeed({
        payload: { retcode: 131207003, message: "Você não tem permissão nesta estação.", data: {} },
        mode: "plan",
        customerCode,
      }),
    ).rejects.toMatchObject({ code: "PORTAL_ERROR" });
  });

  it("reports an unregistered station instead of inventing a location", async () => {
    const desconhecida = payload({
      trip_number: `LH-X-${token}`,
      trip_station: [
        {
          sequence_number: 1,
          station: 910001,
          station_name: "Origem feed",
          sta: NOVE,
          std: NOVE + HORA,
          ata: 0,
          atd: 0,
        },
        {
          sequence_number: 2,
          station: 999999,
          station_name: "Estação que ninguém cadastrou",
          sta: NOVE + 5 * HORA,
          std: 0,
          ata: 0,
          atd: 0,
        },
      ],
    });
    const r = await ingestPortalFeed({ payload: desconhecida, mode: "plan", customerCode });
    if (r.batchId) createdBatchIds.push(r.batchId);
    expect(r.unknownStations.length).toBe(1);
    expect(r.planSummary?.created).toBe(0);
    // Something a person must act on IS worth a history line, even though nothing moved.
    expect(r.batchId).not.toBeNull();
  });

  it("refuses to act without a configured service account", async () => {
    const antes = process.env.PORTAL_FEED_ACTOR_EMAIL;
    delete process.env.PORTAL_FEED_ACTOR_EMAIL;
    await expect(
      ingestPortalFeed({ payload: payload(), mode: "plan", customerCode }),
    ).rejects.toMatchObject({ code: "FEED_ACTOR_UNSET" });
    process.env.PORTAL_FEED_ACTOR_EMAIL = antes;
  });
});
