import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import {
  auditLogs,
  customers,
  db,
  locations,
  marcarRetiradasDoPortal,
  marcarVistasNoPortal,
  tripEvents,
  trips,
  users,
} from "@brazil-tms/db";

/**
 * A varredura que cancela viagem sozinha — e por isso é a que mais precisa de teste.
 *
 * O que se afirma aqui não é o caminho feliz: são as RECUSAS. Uma automação que cancela por ausência
 * é útil enquanto acerta e catastrófica quando erra, e o modo de errar é sempre o mesmo — o robô
 * parou, o portal devolveu página vazia, e de repente "ninguém apareceu" vira "cancele tudo".
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("marcarRetiradasDoPortal (integration)", () => {
  let actorId = "";
  let customerId = "";
  let originId = "";
  let destId = "";
  const criadas: string[] = [];

  const uniq = (p: string): string => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  /** Uma viagem em "Recebida", com coleta amanhã (dentro da janela que o robô varre). */
  async function criar(over: { vistaHa?: string | null } = {}): Promise<string> {
    const ext = uniq("LH-RET");
    const id = (
      await db
        .insert(trips)
        .values({
          customerId,
          externalTripId: ext,
          legNumber: 1,
          originLocationId: originId,
          destinationLocationId: destId,
          currentStatus: "received",
          plannedPickupWindowStart: sql`now() + interval '1 day'`,
          originalPlan: {},
        })
        .returning({ id: trips.id })
    )[0]!.id;
    criadas.push(id);
    if (over.vistaHa !== null) {
      await db
        .update(trips)
        .set({ portalLastSeenAt: sql`now() - ${over.vistaHa ?? "10 hours"}::interval` })
        .where(eq(trips.id, id));
    }
    return id;
  }

  beforeAll(async () => {
    actorId = (await db.select({ id: users.id }).from(users).limit(1))[0]?.id ?? "";
    expect(actorId).not.toBe("");
    customerId = (
      await db
        .insert(customers)
        .values({ name: "Cliente retiradas", customerCode: uniq("CUST-RET") })
        .returning({ id: customers.id })
    )[0]!.id;
    originId = (
      await db
        .insert(locations)
        .values({ customerId, code: uniq("RO"), name: "Origem" })
        .returning({ id: locations.id })
    )[0]!.id;
    destId = (
      await db
        .insert(locations)
        .values({ customerId, code: uniq("RD"), name: "Destino" })
        .returning({ id: locations.id })
    )[0]!.id;
  });

  afterAll(async () => {
    if (criadas.length) {
      await db.delete(tripEvents).where(inArray(tripEvents.tripId, criadas));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, criadas));
      await db.delete(trips).where(inArray(trips.id, criadas));
    }
    if (originId) await db.delete(locations).where(eq(locations.id, originId));
    if (destId) await db.delete(locations).where(eq(locations.id, destId));
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  });

  it("cancela a que sumiu, e deixa em paz a que o robô acabou de ver", async () => {
    const sumida = await criar({ vistaHa: "10 hours" });
    const presente = await criar({ vistaHa: "1 minute" });

    const r = await marcarRetiradasDoPortal(actorId);
    expect(r.barradoPeloTeto).toBe(false);

    const depois = await db
      .select({ id: trips.id, status: trips.currentStatus })
      .from(trips)
      .where(inArray(trips.id, [sumida, presente]));
    const porId = new Map(depois.map((t) => [t.id, t.status]));
    expect(porId.get(sumida)).toBe("cancelled");
    // Vista há um minuto: está lá, e nada justifica tocar nela.
    expect(porId.get(presente)).toBe("received");
  });

  it("NUNCA toca em viagem que jamais apareceu numa listagem", async () => {
    /**
     * `portalLastSeenAt` nulo é "nunca esteve no portal" — viagem digitada à mão, planilha antiga.
     * Ausência não significa nada para quem nunca esteve lá, e tratar as duas coisas como iguais
     * cancelaria em massa tudo o que não vem do robô.
     */
    const manual = await criar({ vistaHa: null });

    await marcarRetiradasDoPortal(actorId);

    const depois = (
      await db.select({ status: trips.currentStatus }).from(trips).where(eq(trips.id, manual))
    )[0]!;
    expect(depois.status).toBe("received");
  });

  it("o TETO barra a varredura inteira: retiradas demais não cancelam NADA", async () => {
    /**
     * A trava que existe para o dia ruim. Se o robô parar ou o portal devolver página vazia, TODA
     * viagem fica sem ser vista — e sem este teto a varredura seguinte cancelaria a operação inteira,
     * em silêncio, de madrugada. Uma varredura sadia acha unidades; dezenas é sintoma, não trabalho.
     */
    const ids = [await criar({ vistaHa: "10 hours" }), await criar({ vistaHa: "10 hours" })];

    const r = await marcarRetiradasDoPortal(actorId, { teto: 1 });
    expect({ barrado: r.barradoPeloTeto, canceladas: r.canceladas }).toEqual({
      barrado: true,
      canceladas: 0,
    });

    const depois = await db
      .select({ status: trips.currentStatus })
      .from(trips)
      .where(inArray(trips.id, ids));
    expect(depois.every((t) => t.status === "received")).toBe(true);
  });

  it("ser vista de novo zera o relógio — a aba Aceito conta como ter aparecido", async () => {
    // A viagem some do Planejado assim que é aceita. Se só o Planejado carimbasse, toda viagem
    // aceita viraria "retirada" três horas depois — cancelando justamente as que foram em frente.
    const id = await criar({ vistaHa: "10 hours" });
    const ext = (
      await db.select({ ext: trips.externalTripId }).from(trips).where(eq(trips.id, id))
    )[0]!.ext!;

    await marcarVistasNoPortal(customerId, [ext]);
    await marcarRetiradasDoPortal(actorId);

    const depois = (
      await db.select({ status: trips.currentStatus }).from(trips).where(eq(trips.id, id))
    )[0]!;
    expect(depois.status).toBe("received");
  });
});
