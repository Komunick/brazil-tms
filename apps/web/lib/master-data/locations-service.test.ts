import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditLogs, customers, db, locations, users } from "@brazil-tms/db";
import { NotFound } from "@/lib/api/respond";
import {
  archiveLocation,
  createLocation,
  listLocations,
  updateLocation,
} from "./locations-service";

/**
 * Integration test against the live dev DB (US2). Static imports per project convention; the Drizzle
 * `db` connects lazily, so importing is safe. The suite skips when DATABASE_URL is unset (e.g. CI
 * without a database) so the default `pnpm test` stays green. To run it:
 *   $env:DATABASE_URL='postgres://postgres:postgres@localhost:5433/postgres'; pnpm exec vitest run --project web
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("locations-service (integration)", () => {
  let actorId = "";
  let customerId = "";
  const createdLocationIds: string[] = [];
  const createdCustomerIds: string[] = [];

  beforeAll(async () => {
    const admin = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@braziltransports.com.br"))
      .limit(1);
    actorId = admin[0]?.id ?? "";
    expect(actorId, "seeded admin must exist (run db:seed)").not.toBe("");

    // Prerequisite: a customer to scope the locations under.
    const customer = await db
      .insert(customers)
      .values({ name: "Cliente Locais Teste", customerCode: code("CUST-LOC") })
      .returning();
    customerId = customer[0]!.id;
    createdCustomerIds.push(customerId);
  });

  afterAll(async () => {
    // FK-safe order: locations first (none reference each other), then customers.
    for (const id of createdLocationIds) {
      await db.delete(auditLogs).where(eq(auditLogs.entityId, id));
      await db.delete(locations).where(eq(locations.id, id));
    }
    for (const id of createdCustomerIds) {
      await db.delete(auditLogs).where(eq(auditLogs.entityId, id));
      await db.delete(customers).where(eq(customers.id, id));
    }
  });

  function code(prefix = "LOC-TEST"): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  it("create inserts the row and emits location.create in the same transaction", async () => {
    const locCode = code();
    const dto = await createLocation(
      { customerId, code: locCode, name: "CD São Paulo", country: "BR" },
      actorId,
    );
    createdLocationIds.push(dto.id);
    expect(dto.code).toBe(locCode);
    expect(dto.customerId).toBe(customerId);
    expect(dto.archived).toBe(false);

    const audits = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, dto.id), eq(auditLogs.action, "location.create")));
    expect(audits).toHaveLength(1);
  });

  it("rejects a duplicate (customer_id, code) with Conflict DUPLICATE_LOCATION_CODE", async () => {
    const locCode = code();
    const first = await createLocation(
      { customerId, code: locCode, name: "Primeiro", country: "BR" },
      actorId,
    );
    createdLocationIds.push(first.id);

    await expect(
      createLocation({ customerId, code: locCode, name: "Segundo", country: "BR" }, actorId),
    ).rejects.toMatchObject({ code: "DUPLICATE_LOCATION_CODE" });
  });

  it("archive sets archived_at and emits location.archive; idempotent on re-archive", async () => {
    const dto = await createLocation(
      { customerId, code: code(), name: "Para Arquivar", country: "BR" },
      actorId,
    );
    createdLocationIds.push(dto.id);

    const archived = await archiveLocation(dto.id, actorId);
    expect(archived.archived).toBe(true);
    expect(archived.archivedAt).not.toBeNull();

    const audits = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, dto.id), eq(auditLogs.action, "location.archive")));
    expect(audits).toHaveLength(1);

    // Active-only list excludes it; includeArchived returns it.
    const active = await listLocations({ customerId });
    expect(active.find((l) => l.id === dto.id)).toBeUndefined();
    const all = await listLocations({ customerId, includeArchived: true });
    expect(all.find((l) => l.id === dto.id)).toBeDefined();

    // Re-archiving is idempotent and writes no second archive audit.
    await archiveLocation(dto.id, actorId);
    const auditsAfter = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, dto.id), eq(auditLogs.action, "location.archive")));
    expect(auditsAfter).toHaveLength(1);
  });

  it("rejects creating a location under an ARCHIVED customer (P1)", async () => {
    const archived = (
      await db
        .insert(customers)
        .values({
          name: "Cliente Arquivado",
          customerCode: code("CUST-ARCH"),
          archivedAt: new Date(),
        })
        .returning()
    )[0]!;
    createdCustomerIds.push(archived.id);

    await expect(
      createLocation({ customerId: archived.id, code: code(), name: "X", country: "BR" }, actorId),
    ).rejects.toMatchObject({ code: "INACTIVE_CUSTOMER" });
  });

  it("update of a missing location throws NOT_FOUND", async () => {
    await expect(
      updateLocation("00000000-0000-0000-0000-000000000000", { name: "X" }, actorId),
    ).rejects.toBeInstanceOf(NotFound);
  });

  /**
   * A REGIÃO editável pela tela (2026-08-20). O que se afirma é o ciclo inteiro: grava, lê de volta,
   * muda, e desclassifica. Antes disto a região só entrava por seed — mudar uma exigia PR e deploy.
   */
  it("grava a região, devolve na leitura e aceita desclassificar", async () => {
    const criada = await createLocation(
      {
        customerId,
        code: `RG-${Date.now()}`,
        name: "Estação com região",
        country: "BR",
        region: "SUDESTE",
      },
      actorId,
    );
    createdLocationIds.push(criada.id);
    expect(criada.region).toBe("SUDESTE");

    const trocada = await updateLocation(criada.id, { region: "NONE" }, actorId);
    expect(trocada.region).toBe("NONE");

    // Desclassificar é caso de uso real: estação que sai da operação volta a ser pendência.
    const limpa = await updateLocation(criada.id, { region: null }, actorId);
    expect(limpa.region).toBeNull();
  });

  it("nasce SEM região quando ninguém informa — é o estado inicial, não um erro", async () => {
    const criada = await createLocation(
      { customerId, code: `RG-SEM-${Date.now()}`, name: "Estação nova", country: "BR" },
      actorId,
    );
    createdLocationIds.push(criada.id);
    expect(criada.region).toBeNull();
  });

  /** A fila de classificação: o recorte tem de trazer a nova e NÃO trazer a que já foi classificada. */
  it("o recorte de pendentes traz só as estações sem região", async () => {
    const semRegiao = await createLocation(
      { customerId, code: `RG-P1-${Date.now()}`, name: "Pendente", country: "BR" },
      actorId,
    );
    const comRegiao = await createLocation(
      {
        customerId,
        code: `RG-P2-${Date.now()}`,
        name: "Classificada",
        country: "BR",
        region: "SULCO",
      },
      actorId,
    );
    createdLocationIds.push(semRegiao.id, comRegiao.id);

    const pendentes = await listLocations({ customerId, missingRegion: true });
    const ids = pendentes.map((l) => l.id);
    expect(ids).toContain(semRegiao.id);
    expect(ids).not.toContain(comRegiao.id);
    expect(pendentes.every((l) => l.region === null)).toBe(true);
  });
});
