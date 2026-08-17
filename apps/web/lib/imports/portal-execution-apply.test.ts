import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import type { PortalTrip } from "@brazil-tms/shared";
import {
  applyPortalTrip,
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
 * Writing the customer's execution onto trips the TMS already has. The properties that matter are
 * the refusals — it must never invent a trip, never drag one backwards, and never double a timeline
 * when the same export is imported twice. Skips without DATABASE_URL.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("applyPortalTrip (integration)", () => {
  let actorId = "";
  let customerId = "";
  let originId = "";
  let destId = "";
  const tripIds: string[] = [];

  const uniq = (p: string): string => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  /** The portal's shape for one two-stop trip, with the instants it recorded. */
  const portalTrip = (externalTripId: string, over: Partial<PortalTrip> = {}): PortalTrip => ({
    externalTripId,
    tripName: "20260812Adhoc",
    status: "Completed",
    driverLabel: "[123]FULANO",
    vehicleLabel: "CARRETA",
    plateLabel: "ABC1D23",
    stops: [],
    legs: [
      {
        legNumber: 1,
        origin: {
          sequence: 1,
          stationValue: "[900001]Origem do portal",
          stationId: "900001",
          stationName: "Origem do portal",
          plannedArrival: "12/08/2026 22:40",
          plannedDeparture: "12/08/2026 23:59",
          actualArrival: "12/08/2026 22:31",
          actualDeparture: "12/08/2026 23:53",
        },
        destination: {
          sequence: 2,
          stationValue: "[900002]Destino do portal",
          stationId: "900002",
          stationName: "Destino do portal",
          plannedArrival: "13/08/2026 08:30",
          plannedDeparture: null,
          actualArrival: "13/08/2026 08:11",
          actualDeparture: null,
        },
      },
    ],
    ...over,
  });

  async function makeTrip(status = "received"): Promise<{ id: string; ext: string }> {
    const ext = uniq("LH-PORTAL");
    const inserted = await db
      .insert(trips)
      .values({
        customerId,
        externalTripId: ext,
        legNumber: 1,
        originLocationId: originId,
        destinationLocationId: destId,
        originalPlan: {},
        currentStatus: status as "received",
      })
      .returning({ id: trips.id });
    const id = inserted[0]!.id;
    tripIds.push(id);
    return { id, ext };
  }

  beforeAll(async () => {
    actorId = (await db.select({ id: users.id }).from(users).limit(1))[0]?.id ?? "";
    expect(actorId).not.toBe("");

    customerId = (
      await db
        .insert(customers)
        .values({ name: "Cliente portal", customerCode: uniq("CUST-PORTAL") })
        .returning({ id: customers.id })
    )[0]!.id;

    const codeA = uniq("ORIG");
    const codeB = uniq("DEST");
    originId = (
      await db
        .insert(locations)
        .values({ customerId, code: codeA, name: "Origem" })
        .returning({ id: locations.id })
    )[0]!.id;
    destId = (
      await db
        .insert(locations)
        .values({ customerId, code: codeB, name: "Destino" })
        .returning({ id: locations.id })
    )[0]!.id;

    // The reconciliation the whole import depends on: the customer's station id → our site.
    const { linked } = await linkStationIds(customerId, [
      { stationId: "900001", code: codeA },
      { stationId: "900002", code: codeB },
    ]);
    expect(linked).toBe(2);
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

  it("moves the trip to where the truck actually got, stamping the REAL instants", async () => {
    const { id: tripId, ext } = await makeTrip("assigned");
    const map = await loadStationMap(customerId);
    const [outcome] = await applyPortalTrip(
      customerId,
      portalTrip(ext),
      map,
      actorId,
      "portal.csv",
    );

    expect(outcome!.status).toBe("applied");
    const after = (await db.select().from(trips).where(eq(trips.id, tripId)).limit(1))[0]!;
    expect(after.currentStatus).toBe("at_destination");

    const events = await db.select().from(tripEvents).where(eq(tripEvents.tripId, tripId));
    const arrival = events.find((e) => e.eventType === "origin_arrived")!;
    // 12/08/2026 22:31 in São Paulo is 01:31Z the next day — the customer's own instant, not ours.
    expect(arrival.eventTimestamp?.toISOString()).toBe("2026-08-13T01:31:00.000Z");
    expect(arrival.source).toBe("import");
    expect(events.some((e) => e.eventType === "departed")).toBe(true);
    expect(events.some((e) => e.eventType === "destination_arrived")).toBe(true);

    // The steps merely passed through carry NO invented time.
    const confirmed = events.find((e) => e.statusAfter === "confirmed")!;
    expect(confirmed.eventTimestamp).toBeNull();
  });

  it("is idempotent: importing the same export twice writes nothing the second time", async () => {
    const { id: tripId, ext } = await makeTrip("assigned");
    const map = await loadStationMap(customerId);
    await applyPortalTrip(customerId, portalTrip(ext), map, actorId, "portal.csv");
    const first = await db.select().from(tripEvents).where(eq(tripEvents.tripId, tripId));

    const [second] = await applyPortalTrip(customerId, portalTrip(ext), map, actorId, "portal.csv");
    expect(second!.status).toBe("already_ahead");
    const after = await db.select().from(tripEvents).where(eq(tripEvents.tripId, tripId));
    expect(after.length).toBe(first.length);
  });

  it("REFUSES to drag a trip backwards — the file is behind, the operation is not", async () => {
    const { id: tripId, ext } = await makeTrip("completed");
    const map = await loadStationMap(customerId);
    const [outcome] = await applyPortalTrip(
      customerId,
      portalTrip(ext),
      map,
      actorId,
      "portal.csv",
    );
    expect(outcome!.status).toBe("closed");

    const after = (await db.select().from(trips).where(eq(trips.id, tripId)).limit(1))[0]!;
    expect(after.currentStatus).toBe("completed");
    expect(await db.select().from(tripEvents).where(eq(tripEvents.tripId, tripId))).toHaveLength(0);
  });

  it("NEVER creates a trip: an execution row for a trip the TMS does not have is reported", async () => {
    const map = await loadStationMap(customerId);
    const [outcome] = await applyPortalTrip(
      customerId,
      portalTrip(uniq("LH-INEXISTENTE")),
      map,
      actorId,
      "portal.csv",
    );
    expect(outcome!.status).toBe("not_found");
  });

  it("reports a station the TMS cannot resolve instead of guessing which site it is", async () => {
    const { ext } = await makeTrip("assigned");
    const map = await loadStationMap(customerId);
    const trip = portalTrip(ext);
    trip.legs[0]!.destination.stationId = "999999"; // não vinculada
    const [outcome] = await applyPortalTrip(customerId, trip, map, actorId, "portal.csv");
    expect(outcome!.status).toBe("unknown_station");
    expect(outcome!.detail).toContain("Destino do portal");
  });

  it("writes nothing for a leg the portal has not timed yet", async () => {
    const { id: tripId, ext } = await makeTrip("assigned");
    const map = await loadStationMap(customerId);
    const trip = portalTrip(ext);
    trip.legs[0]!.origin.actualArrival = null;
    trip.legs[0]!.origin.actualDeparture = null;
    trip.legs[0]!.destination.actualArrival = null;

    const [outcome] = await applyPortalTrip(customerId, trip, map, actorId, "portal.csv");
    expect(outcome!.status).toBe("no_milestones");
    const after = (await db.select().from(trips).where(eq(trips.id, tripId)).limit(1))[0]!;
    expect(after.currentStatus).toBe("assigned");
  });
  it("CANCELADA no portal fecha a viagem, mesmo tendo linha do tempo inteira", async () => {
    /**
     * O caso que o usuário apontou: no Concluído existem Cancelled E Completed, e uma cancelada
     * costuma ter horários reais — ela chegou, carregou, e aí foi cancelada.
     *
     * Este caminho não sabia cancelar (só o do plano sabia), e o efeito era pior do que não fazer
     * nada: os marcos empurravam a viagem para "em trânsito" como se estivesse rodando, ela ficava
     * viva no quadro e no painel da parede, alertando — e nunca se resolvia, porque concluir exige
     * que o portal diga "Completed" e uma cancelada nunca diz.
     */
    const { id: tripId, ext } = await makeTrip();
    const map = await loadStationMap(customerId);
    // Mesma linha do tempo completa do caso feliz; só a palavra do cliente muda.
    const trip = portalTrip(ext, { status: "Cancelled" });

    const [outcome] = await applyPortalTrip(customerId, trip, map, actorId, "portal");
    expect(outcome!.status).toBe("closed");

    const after = (await db.select().from(trips).where(eq(trips.id, tripId)).limit(1))[0]!;
    expect(after.currentStatus).toBe("cancelled");

    // E NÃO andou: nenhum marco de chegada foi registrado como se a viagem tivesse acontecido.
    const eventos = await db.select().from(tripEvents).where(eq(tripEvents.tripId, tripId));
    expect(eventos.some((e) => e.eventType === "origin_arrived")).toBe(false);
  });
  it("CANCELADA ANTES DE SAIR fecha a viagem — sem nenhum horário real", async () => {
    /**
     * O caso da LT0Q8H02E2LD1, achado pelo usuário: cancelada no portal com a linha do tempo VAZIA
     * — sem chegada, sem carga, sem partida. É o formato mais comum de cancelamento, e era o único
     * que a correção anterior não pegava: a guarda de marcos ficava na frente e a viagem saía como
     * "no_milestones", seguindo em Recebida e alertando para sempre.
     */
    const { id: tripId, ext } = await makeTrip();
    const map = await loadStationMap(customerId);
    const trip = portalTrip(ext, { status: "Cancelled" });
    // Nenhum horário real em lugar nenhum: a viagem nunca saiu.
    trip.legs[0]!.origin.actualArrival = null;
    trip.legs[0]!.origin.actualDeparture = null;
    trip.legs[0]!.destination.actualArrival = null;

    const [outcome] = await applyPortalTrip(customerId, trip, map, actorId, "portal");
    expect(outcome!.status).toBe("closed");

    const after = (await db.select().from(trips).where(eq(trips.id, tripId)).limit(1))[0]!;
    expect(after.currentStatus).toBe("cancelled");
  });
});
