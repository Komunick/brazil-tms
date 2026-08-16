import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  customers,
  db,
  drivers,
  lanes,
  linkStationIds,
  locations,
  tripAssignments,
  tripEvents,
  trips,
  vehicles,
} from "@brazil-tms/db";
import { ingestPortalFeed } from "./portal-feed";

/**
 * O vínculo automático: a palavra do cliente virando atribuição de verdade.
 *
 * O que importa aqui não é o caminho feliz, é o que ele se RECUSA a fazer — não inventar recurso e
 * não passar por cima das regras do TMS quando o cliente põe na estrada alguém que elas barram.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const HORA = 3600;
const NOVE = Math.floor(Date.UTC(2026, 7, 13, 12, 0, 0) / 1000);

describe.skipIf(!hasDb)("vínculo com a frota (integration)", () => {
  let customerId = "";
  let customerCode = "";
  const token = `FL${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const criados: string[] = [];

  beforeAll(async () => {
    customerCode = `FLEET-${token}`;
    customerId = (
      await db
        .insert(customers)
        .values({ name: `Cliente frota ${token}`, customerCode })
        .returning({ id: customers.id })
    )[0]!.id;
    await db.insert(locations).values([
      { customerId, code: `FLO-${token}`, name: "Origem" },
      { customerId, code: `FLD-${token}`, name: "Destino" },
    ]);
    await linkStationIds(customerId, [
      { stationId: "920001", code: `FLO-${token}` },
      { stationId: "920002", code: `FLD-${token}` },
    ]);
    process.env.PORTAL_FEED_ACTOR_EMAIL = "admin@braziltransports.com.br";

    // Um motorista e um veículo em ordem, e um motorista com CNH vencida.
    const d1 = await db
      .insert(drivers)
      .values({
        name: `MOTORISTA BOM ${token}`,
        ownershipType: "owned",
        status: "active",
        licenseExpiry: "2030-01-01",
      })
      .returning({ id: drivers.id });
    const d2 = await db
      .insert(drivers)
      .values({
        name: `MOTORISTA VENCIDO ${token}`,
        ownershipType: "owned",
        status: "active",
        licenseExpiry: "2020-01-01",
      })
      .returning({ id: drivers.id });
    const v1 = await db
      .insert(vehicles)
      .values({
        plate: `AAA${Math.floor(Math.random() * 9000 + 1000)}`,
        vehicleType: "carreta",
        ownershipType: "owned",
        status: "active",
        documentExpiry: "2030-01-01",
      })
      .returning({ id: vehicles.id, plate: vehicles.plate });
    criados.push(d1[0]!.id, d2[0]!.id, v1[0]!.id);
    placaBoa = v1[0]!.plate;
  });

  let placaBoa = "";

  afterAll(async () => {
    const ids = (
      await db.select({ id: trips.id }).from(trips).where(eq(trips.customerId, customerId))
    ).map((t) => t.id);
    if (ids.length) {
      await db.delete(tripAssignments).where(inArray(tripAssignments.tripId, ids));
      await db.delete(tripEvents).where(inArray(tripEvents.tripId, ids));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, ids));
      await db.delete(trips).where(inArray(trips.id, ids));
    }
    await db.delete(lanes).where(eq(lanes.customerId, customerId));
    await db.delete(locations).where(eq(locations.customerId, customerId));
    await db.delete(auditLogs).where(eq(auditLogs.entityId, customerId));
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(drivers).where(inArray(drivers.id, criados));
    await db.delete(vehicles).where(inArray(vehicles.id, criados));
  });

  function payload(over: Record<string, unknown>) {
    return {
      retcode: 0,
      data: {
        total: 1,
        list: [
          {
            trip_status: 5,
            vehicle_type_name: "CARRETA",
            trip_station: [
              {
                sequence_number: 1,
                station: 920001,
                station_name: "Origem",
                sta: NOVE,
                std: NOVE + HORA,
                ata: 0,
                atd: 0,
              },
              {
                sequence_number: 2,
                station: 920002,
                station_name: "Destino",
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

  it("vincula quando o nome e a placa batem com o cadastro", async () => {
    const ext = `LH-OK-${token}`;
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        driver_name: `Motorista Bom ${token}`,
        vehicle_number: placaBoa.toLowerCase(),
      }),
      mode: "plan",
      customerCode,
    });
    expect(r.planSummary?.linked).toBe(1);

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    expect(trip.currentStatus).toBe("assigned");
    const atrib = await db
      .select()
      .from(tripAssignments)
      .where(eq(tripAssignments.tripId, trip.id));
    expect(atrib).toHaveLength(1);
    expect(atrib[0]!.isCurrent).toBe(true);
  });

  it("não inventa recurso: nome que a frota não tem é reportado", async () => {
    const ext = `LH-SEM-${token}`;
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        driver_name: "Quem Nao Existe",
        vehicle_number: "ZZZ0A00",
      }),
      mode: "plan",
      customerCode,
    });
    expect(r.planSummary?.linkNoMatch).toBe(1);
    expect(r.planSummary?.linked).toBe(0);

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    expect(trip.currentStatus).toBe("received");
  });

  it("RECUSA a escolha do cliente quando as regras do TMS barram, e diz por quê", async () => {
    // O ponto do vínculo: o cliente pôs na estrada um motorista com CNH vencida. O TMS não passa
    // por cima disso em silêncio — reporta, e a viagem fica sem atribuição para alguém resolver.
    const ext = `LH-BLOQ-${token}`;
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        driver_name: `Motorista Vencido ${token}`,
        vehicle_number: placaBoa,
      }),
      mode: "plan",
      customerCode,
    });
    expect(r.planSummary?.linkBlocked).toBe(1);
    expect(r.planSummary?.linkBlockedReasons.join(" ")).toMatch(/bloqueada|exceção/i);

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    expect(trip.currentStatus).toBe("received");
  });
});
