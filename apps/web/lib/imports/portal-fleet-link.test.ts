import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  carriers,
  customers,
  db,
  drivers,
  importBatches,
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
  const carrierIds: string[] = [];

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
    // O vínculo conta como mudança, então o feed passou a registrar lote no histórico deste cliente.
    await db.delete(importBatches).where(eq(importBatches.customerId, customerId));
    await db.delete(lanes).where(eq(lanes.customerId, customerId));
    await db.delete(locations).where(eq(locations.customerId, customerId));
    await db.delete(auditLogs).where(eq(auditLogs.entityId, customerId));
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(drivers).where(inArray(drivers.id, criados));
    await db.delete(vehicles).where(inArray(vehicles.id, criados));
    if (carrierIds.length) await db.delete(carriers).where(inArray(carriers.id, carrierIds));
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

  it("vincula recurso SUBCONTRATADO usando a transportadora do próprio cadastro", async () => {
    // 883 dos 982 motoristas desta frota são subcontratados, e o TMS exige transportadora nesse
    // caso. Ela não é decisão nova: já está no recurso. Sem isso, a primeira rodada real bloqueou
    // 48 e vinculou zero.
    const transportadora = (
      await db
        .insert(carriers)
        .values({
          name: `Transportadora ${token}`,
          taxId: String(Date.now()).slice(0, 14),
          documentationStatus: "complete",
        })
        .returning({ id: carriers.id })
    )[0]!;
    const d = (
      await db
        .insert(drivers)
        .values({
          name: `MOTORISTA TERCEIRO ${token}`,
          ownershipType: "subcontracted",
          carrierId: transportadora.id,
          status: "active",
          licenseExpiry: "2030-01-01",
        })
        .returning({ id: drivers.id })
    )[0]!;
    const v = (
      await db
        .insert(vehicles)
        .values({
          plate: `BBB${Math.floor(Math.random() * 9000 + 1000)}`,
          vehicleType: "carreta",
          ownershipType: "subcontracted",
          carrierId: transportadora.id,
          status: "active",
          documentExpiry: "2030-01-01",
        })
        .returning({ id: vehicles.id, plate: vehicles.plate })
    )[0]!;
    criados.push(d.id, v.id);
    carrierIds.push(transportadora.id);

    const ext = `LH-TERC-${token}`;
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        driver_name: `Motorista Terceiro ${token}`,
        vehicle_number: v.plate,
      }),
      mode: "plan",
      customerCode,
    });
    // Objeto inteiro na asserção: se falhar, a mensagem já diz POR QUE não vinculou.
    expect({
      linked: r.planSummary?.linked,
      bloqueadas: r.planSummary?.linkBlockedReasons,
      semCadastro: r.planSummary?.linkNoMatch,
    }).toEqual({ linked: 1, bloqueadas: [], semCadastro: 0 });

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    const atrib = (
      await db.select().from(tripAssignments).where(eq(tripAssignments.tripId, trip.id))
    )[0]!;
    expect(atrib.carrierId).toBe(transportadora.id);
  });

  it("vincula com AVISO quando falta a data do documento, e grava o motivo", async () => {
    // O caso real: 901 dos 902 veículos não têm validade de documento cadastrada. Isso é aviso, não
    // impedimento — e exigir uma pessoa por viagem faria ninguém ser atribuído nunca. Vincula, e o
    // motivo fica gravado na atribuição, auditável.
    const v = (
      await db
        .insert(vehicles)
        .values({
          plate: `CCC${Math.floor(Math.random() * 9000 + 1000)}`,
          vehicleType: "carreta",
          ownershipType: "owned",
          status: "active",
          // sem documentExpiry — é o que dispara o aviso
        })
        .returning({ id: vehicles.id, plate: vehicles.plate })
    )[0]!;
    // Motorista PRÓPRIO deste caso: reusar o do primeiro teste, na mesma janela, dispararia
    // conflito de agenda — que é bloqueio por decisão, e mascararia o que se quer verificar aqui.
    const d = (
      await db
        .insert(drivers)
        .values({
          name: `MOTORISTA DOIS ${token}`,
          ownershipType: "owned",
          status: "active",
          licenseExpiry: "2030-01-01",
        })
        .returning({ id: drivers.id })
    )[0]!;
    criados.push(v.id, d.id);

    const ext = `LH-AVISO-${token}`;
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        driver_name: `Motorista Dois ${token}`,
        vehicle_number: v.plate,
      }),
      mode: "plan",
      customerCode,
    });
    expect(r.planSummary?.linked).toBe(1);
    expect(r.planSummary?.linkedWithWarnings).toBe(1);

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    expect(trip.currentStatus).toBe("assigned");
    const atrib = (
      await db.select().from(tripAssignments).where(eq(tripAssignments.tripId, trip.id))
    )[0]!;
    // O motivo diz que é espelho do cliente E quais avisos foram aceitos — nada passa calado.
    expect(atrib.overrideReason).toMatch(/espelho.*portal/i);
    expect(atrib.overrideReason).toMatch(/doc_missing/);
  });

  it("viagem sem motorista designado no portal não conta como pendência de cadastro", async () => {
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: `LH-VAZIO-${token}`,
        driver_name: null,
        vehicle_number: null,
      }),
      mode: "plan",
      customerCode,
    });
    expect(r.planSummary?.linkNotStated).toBe(1);
    expect(r.planSummary?.linkNoMatch).toBe(0);
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
