import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  auditLogs,
  billingItems,
  ensureBillingItem,
  transitionTripStatus,
  customers,
  alerts,
  db,
  documentRequirements,
  documents,
  documentTypes,
  locations,
  rates,
  tripEvents,
  trips,
  users,
} from "@brazil-tms/db";
import { markBillingReady, markCompleted } from "./billing";

/**
 * Põe a viagem na fila do dinheiro À MÃO, porque o automático foi desligado (2026-08-20).
 *
 * A etapa de faturamento continua existindo e continua tendo dono — o que saiu foi o salto
 * automático depois de concluir. Os casos de `markBillingReady` precisam do estado que aquele
 * salto criava, então o montam explicitamente: é a diferença entre testar a etapa e testar quem a
 * dispara, e agora ela importa.
 */
async function porNaFilaDeFaturamento(tripId: string, actorId: string): Promise<void> {
  await transitionTripStatus(
    tripId,
    { toStatus: "billing_pending", expectedFromStatus: "completed" },
    actorId,
  );
  await db.transaction(async (tx) => ensureBillingItem(tx, tripId));
}

/**
 * Feature 008 (US2, T069) — the gated completion + Billing-Ready transitions against the live dev DB.
 * Static imports; skips when DATABASE_URL is unset. Seeds a customer with a completion+billing-required
 * document type and a customer-default rate so auto-pricing + the gates are exercised end-to-end.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("completion + billing-ready gates (integration, US2)", () => {
  let actorId = "";
  let customerId = "";
  let originId = "";
  let destId = "";
  let typeId = "";
  const createdTripIds: string[] = [];

  function code(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  async function seedTripAt(status: "unloaded"): Promise<string> {
    const row = await db
      .insert(trips)
      .values({
        customerId,
        originLocationId: originId,
        destinationLocationId: destId,
        originalPlan: {},
        currentStatus: status,
      })
      .returning({ id: trips.id });
    createdTripIds.push(row[0]!.id);
    return row[0]!.id;
  }

  beforeAll(async () => {
    const admin = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@braziltransports.com.br"))
      .limit(1);
    actorId = admin[0]?.id ?? "";
    expect(actorId, "seeded admin must exist (run db:seed)").not.toBe("");

    const cust = await db
      .insert(customers)
      .values({ name: "Cliente Conclusão", customerCode: code("CUST") })
      .returning();
    customerId = cust[0]!.id;
    originId = (
      await db
        .insert(locations)
        .values({ customerId, code: code("O"), name: "Origem" })
        .returning()
    )[0]!.id;
    destId = (
      await db
        .insert(locations)
        .values({ customerId, code: code("D"), name: "Destino" })
        .returning()
    )[0]!.id;

    typeId = (
      await db
        .insert(documentTypes)
        .values({ code: code("dt"), labelPt: "POD" })
        .returning()
    )[0]!.id;
    // A document required for BOTH completion and billing.
    await db.insert(documentRequirements).values({
      customerId,
      documentTypeId: typeId,
      requiredForCompletion: true,
      requiredForBilling: true,
    });
    // A customer-default rate so completion auto-prices the billing item.
    await db.insert(rates).values({ customerId, baseAmountCents: 150_000 });
  });

  afterAll(async () => {
    for (const id of createdTripIds) {
      const items = await db
        .select({ id: billingItems.id })
        .from(billingItems)
        .where(eq(billingItems.tripId, id));
      for (const it of items) {
        await db.delete(billingItems).where(eq(billingItems.id, it.id));
      }
      await db.delete(documents).where(eq(documents.tripId, id));
      await db.delete(tripEvents).where(eq(tripEvents.tripId, id));
      await db.delete(auditLogs).where(eq(auditLogs.entityId, id));
      await db.delete(alerts).where(eq(alerts.tripId, id));
      await db.delete(trips).where(eq(trips.id, id));
    }
    await db.delete(documentRequirements).where(eq(documentRequirements.customerId, customerId));
    await db.delete(rates).where(eq(rates.customerId, customerId));
    if (typeId) await db.delete(documentTypes).where(eq(documentTypes.id, typeId));
    for (const id of [originId, destId]) {
      if (id) await db.delete(locations).where(eq(locations.id, id));
    }
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  });

  it("markCompleted is blocked when a completion-required document is missing", async () => {
    const tripId = await seedTripAt("unloaded");
    await expect(markCompleted(tripId, {}, actorId)).rejects.toMatchObject({
      code: "COMPLETION_BLOCKED",
    });
    const after = await db
      .select({ s: trips.currentStatus })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    expect(after[0]!.s).toBe("unloaded"); // no state change
  });

  /**
   * A viagem PARA EM "CONCLUÍDA" (2026-08-20, a pedido). O salto automático para faturamento foi
   * desligado porque a operação não trabalha essa fila hoje, e estado que ninguém trabalha não é
   * etapa. Este teste afirmava o contrário e foi invertido — o `waiver` e a trava dos documentos,
   * que são o assunto dele, continuam valendo igual.
   */
  it("a waiver satisfies the gate; the trip completes and STOPS there — no billing hop, no item", async () => {
    const tripId = await seedTripAt("unloaded");
    const detail = await markCompleted(
      tripId,
      { waivedRequirements: [{ documentTypeId: typeId, reason: "indisponível" }] },
      actorId,
    );
    expect(detail.currentStatus).toBe("completed");

    // A waiver row (no file) was recorded + a document.waive audit.
    const waiver = detail.documents.find((d) => d.isWaiver);
    expect(waiver).toBeDefined();
    expect(waiver!.fileStorageKey).toBeNull();
    const waiveAudit = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, waiver!.id), eq(auditLogs.action, "document.waive")));
    expect(waiveAudit.length).toBe(1);

    // O item de faturamento NÃO nasce mais junto: ele pertence à etapa que foi desligada. A
    // precificação automática a partir da tarifa continua existindo — ver `billing-items.test.ts`,
    // que exercita `ensureBillingItem` direto. O que saiu daqui foi o gatilho, não o cálculo.
    expect(detail.billing).toBeNull();

    // A transição que sobrou continua passando por `transitionTripStatus` (auditoria + evento).
    const statusChanges = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, tripId), eq(auditLogs.action, "trip.status_change")));
    expect(statusChanges.length).toBeGreaterThanOrEqual(1);
    const events = await db
      .select({ id: tripEvents.id })
      .from(tripEvents)
      .where(and(eq(tripEvents.tripId, tripId), eq(tripEvents.eventType, "status_change")));
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("markBillingReady is blocked by an open dispute, then succeeds once cleared", async () => {
    const tripId = await seedTripAt("unloaded");
    await markCompleted(
      tripId,
      { waivedRequirements: [{ documentTypeId: typeId, reason: "indisponível" }] },
      actorId,
    );
    await porNaFilaDeFaturamento(tripId, actorId);

    // Open a billing dispute → §19.4 blocks.
    await db
      .update(billingItems)
      .set({ disputeStatus: "open" })
      .where(eq(billingItems.tripId, tripId));
    await expect(markBillingReady(tripId, {}, actorId)).rejects.toMatchObject({
      code: "BILLING_READY_BLOCKED",
    });

    // Clear it → the billing doc is waived, pricing present, no dispute → passes.
    await db
      .update(billingItems)
      .set({ disputeStatus: "none" })
      .where(eq(billingItems.tripId, tripId));
    const detail = await markBillingReady(tripId, {}, actorId);
    expect(detail.currentStatus).toBe("billing_ready");
    expect(detail.billingStatus).toBe("billing_ready");
  });
});
