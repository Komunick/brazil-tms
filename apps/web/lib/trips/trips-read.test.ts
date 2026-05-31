import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { auditLogs, customers, db, lanes, locations, tripEvents, trips } from "@brazil-tms/db";
import { dayRangeSaoPaulo } from "@brazil-tms/shared";
import {
  exportTripRows,
  getTripDetailView,
  getTripFilterOptions,
  queryDashboardMetrics,
  queryTripBoard,
} from "./trips-read";

/**
 * Integration test for the feature 005 read models against the live dev DB. Static imports per
 * project convention (`test.skipIf` on lazily-imported modules does NOT work). Skips when
 * DATABASE_URL is unset so the default `pnpm test` stays green. To run it:
 *   $env:DATABASE_URL='postgres://postgres:postgres@localhost:5433/postgres'; pnpm exec vitest run --project web
 *
 * Focus: the board defaults to the active scope (closed/billing statuses excluded); explicit
 * status/billing/customer/AND filters and `q`; whitelist sort by pickup; pagination + full `total`;
 * the enriched detail view (names + importBatchId); the dashboard today-by-status + billing-pending
 * counts with every later-slice metric null; and the export rows + the `EXPORT_TOO_LARGE` cap.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("trips-read (integration)", () => {
  let customerId = "";
  let originId = "";
  let destId = "";
  let laneId = "";

  // Seeded trip ids, captured for FK-safe cleanup.
  let inTransitId = "";
  let validatedId = "";
  let completedId = "";
  let billingPendingId = "";
  let todayPickupId = "";
  let extSearchId = "";

  const createdTripIds: string[] = [];
  const createdLaneIds: string[] = [];
  const createdLocationIds: string[] = [];
  const createdCustomerIds: string[] = [];

  // Unique external id token to scope the board `q`/customer queries to THIS test's seed only.
  const seedToken = `RT${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  let counter = 0;
  function code(prefix = "TRIP-READ-TEST"): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
  function ext(): string {
    return `${seedToken}-${counter++}`;
  }

  async function seedTrip(
    currentStatus: (typeof trips.$inferSelect)["currentStatus"],
    pickup: Date | null,
  ): Promise<string> {
    const externalTripId = ext();
    const inserted = await db
      .insert(trips)
      .values({
        customerId,
        externalTripId,
        originLocationId: originId,
        destinationLocationId: destId,
        laneId,
        currentStatus,
        originalPlan: { customerId, originLocationId: originId, destinationLocationId: destId },
        plannedPickupWindowStart: pickup,
      })
      .returning({ id: trips.id });
    const id = inserted[0]!.id;
    createdTripIds.push(id);
    return id;
  }

  beforeAll(async () => {
    const cust = await db
      .insert(customers)
      .values({ name: `Cliente Control Tower ${seedToken}`, customerCode: code("CUST") })
      .returning({ id: customers.id });
    customerId = cust[0]!.id;
    createdCustomerIds.push(customerId);

    const origin = await db
      .insert(locations)
      .values({ customerId, code: code("ORIG"), name: `Origem ${seedToken}` })
      .returning({ id: locations.id });
    originId = origin[0]!.id;
    createdLocationIds.push(originId);

    const dest = await db
      .insert(locations)
      .values({ customerId, code: code("DEST"), name: `Destino ${seedToken}` })
      .returning({ id: locations.id });
    destId = dest[0]!.id;
    createdLocationIds.push(destId);

    const lane = await db
      .insert(lanes)
      .values({ customerId, originLocationId: originId, destinationLocationId: destId })
      .returning({ id: lanes.id });
    laneId = lane[0]!.id;
    createdLaneIds.push(laneId);

    // Trips across different statuses + pickup dates. The "today" trip pins its pickup to the middle
    // of the current São Paulo day so the dashboard groups it regardless of the host timezone.
    const { from } = dayRangeSaoPaulo(new Date());
    const todayMidday = new Date(new Date(from).getTime() + 12 * 60 * 60 * 1000);

    inTransitId = await seedTrip("in_transit", new Date("2026-06-01T08:00:00.000Z"));
    validatedId = await seedTrip("validated", new Date("2026-06-02T08:00:00.000Z"));
    completedId = await seedTrip("completed", new Date("2026-06-03T08:00:00.000Z"));
    billingPendingId = await seedTrip("billing_pending", new Date("2026-06-04T08:00:00.000Z"));
    todayPickupId = await seedTrip("in_transit", todayMidday);
    extSearchId = inTransitId;
  });

  afterAll(async () => {
    // FK-safe order: trip_events + audit (for trips) → trips → lanes → locations → customers.
    if (createdTripIds.length) {
      await db.delete(tripEvents).where(inArray(tripEvents.tripId, createdTripIds));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdTripIds));
      await db.delete(trips).where(inArray(trips.id, createdTripIds));
    }
    if (createdLaneIds.length) {
      await db.delete(lanes).where(inArray(lanes.id, createdLaneIds));
    }
    if (createdLocationIds.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdLocationIds));
      await db.delete(locations).where(inArray(locations.id, createdLocationIds));
    }
    if (createdCustomerIds.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdCustomerIds));
      await db.delete(customers).where(inArray(customers.id, createdCustomerIds));
    }
  });

  // A board query scoped to this seed's customer with sane defaults.
  function boardQuery(overrides: Partial<Parameters<typeof queryTripBoard>[0]> = {}) {
    return {
      customerId,
      scope: "active" as const,
      sort: "pickupStart" as const,
      dir: "asc" as const,
      limit: 50,
      offset: 0,
      ...overrides,
    } as Parameters<typeof queryTripBoard>[0];
  }

  it("default active scope excludes completed/billing statuses", async () => {
    const { rows } = await queryTripBoard(boardQuery());
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(inTransitId);
    expect(ids).toContain(validatedId);
    expect(ids).toContain(todayPickupId);
    expect(ids).not.toContain(completedId);
    expect(ids).not.toContain(billingPendingId);
  });

  it("explicit status filter overrides the active default", async () => {
    const { rows } = await queryTripBoard(boardQuery({ status: ["completed"] }));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(completedId);
    expect(ids).not.toContain(inTransitId);
  });

  it("billingStatus filter maps to the matching current_status", async () => {
    const { rows } = await queryTripBoard(boardQuery({ billingStatus: "billing_pending" }));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(billingPendingId);
    expect(ids).not.toContain(inTransitId);
    expect(rows.every((r) => r.billingStatus === "billing_pending")).toBe(true);
  });

  it("AND-combines customer + status filters", async () => {
    const { rows } = await queryTripBoard(boardQuery({ status: ["validated"] }));
    expect(rows.every((r) => r.customerId === customerId)).toBe(true);
    expect(rows.map((r) => r.id)).toEqual([validatedId]);
  });

  it("status + billingStatus compose with AND (intersection), not else-if", async () => {
    // Contradictory pair → empty: a trip cannot be both in_transit AND billing_pending.
    const contradictory = await queryTripBoard(
      boardQuery({ status: ["in_transit"], billingStatus: "billing_pending" }),
    );
    expect(contradictory.rows).toHaveLength(0);

    // Consistent pair → the intersection (the billing_pending trip).
    const consistent = await queryTripBoard(
      boardQuery({ status: ["billing_pending"], billingStatus: "billing_pending" }),
    );
    expect(consistent.rows.map((r) => r.id)).toEqual([billingPendingId]);
  });

  it("getTripFilterOptions returns the active customers / locations / lanes for dropdowns", async () => {
    const options = await getTripFilterOptions();
    expect(options.customers.some((c) => c.id === customerId)).toBe(true);
    expect(options.locations.some((l) => l.id === originId && l.code !== "")).toBe(true);
    expect(options.locations.some((l) => l.id === destId)).toBe(true);
    expect(
      options.lanes.some(
        (l) => l.id === laneId && l.originLocationId === originId && l.destinationLocationId === destId,
      ),
    ).toBe(true);
  });

  it("q matches the external trip id and enriches names + laneLabel", async () => {
    const target = await db
      .select({ externalTripId: trips.externalTripId })
      .from(trips)
      .where(eq(trips.id, extSearchId))
      .limit(1);
    const { rows } = await queryTripBoard(boardQuery({ q: target[0]!.externalTripId! }));
    expect(rows.map((r) => r.id)).toEqual([extSearchId]);
    const row = rows[0]!;
    expect(row.customerName).toContain(seedToken);
    expect(row.originName).toContain(seedToken);
    expect(row.laneLabel).toBe(`${row.originCode} → ${row.destinationCode}`);
  });

  it("sorts by pickupStart ascending", async () => {
    const { rows } = await queryTripBoard(boardQuery({ scope: "all" }));
    const pickups = rows
      .map((r) => r.plannedPickupWindowStart)
      .filter((p): p is string => p !== null);
    const sorted = [...pickups].sort();
    expect(pickups).toEqual(sorted);
  });

  it("paginates while reporting the full match total", async () => {
    const full = await queryTripBoard(boardQuery({ scope: "all" }));
    expect(full.total).toBe(createdTripIds.length);
    expect(full.rows.length).toBe(createdTripIds.length);

    const page = await queryTripBoard(boardQuery({ scope: "all", limit: 2, offset: 0 }));
    expect(page.rows.length).toBe(2);
    // total is independent of limit/offset.
    expect(page.total).toBe(createdTripIds.length);
  });

  it("getTripDetailView returns enriched names + importBatchId", async () => {
    const detail = await getTripDetailView(inTransitId);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(inTransitId);
    expect(detail!.customerName).toContain(seedToken);
    expect(detail!.originName).toContain(seedToken);
    expect(detail!.destinationCode).not.toBe("");
    expect(detail!.laneLabel).toBe(`${detail!.originCode} → ${detail!.destinationCode}`);
    // importBatchId is surfaced (null for this seed) — the field exists on the view.
    expect(detail!.importBatchId).toBeNull();
    expect(Array.isArray(detail!.events)).toBe(true);
  });

  it("getTripDetailView returns null for an unknown id", async () => {
    const missing = await getTripDetailView("00000000-0000-0000-0000-000000000000");
    expect(missing).toBeNull();
  });

  it("queryDashboardMetrics counts today's pickup by status + billing pending, others null", async () => {
    const metrics = await queryDashboardMetrics();

    const todayInTransit = metrics.tripsTodayByStatus.find((s) => s.status === "in_transit");
    expect(todayInTransit).toBeDefined();
    expect(todayInTransit!.count).toBeGreaterThanOrEqual(1);

    expect(metrics.billingPendingCount).toBeGreaterThanOrEqual(1);

    expect(metrics.tripsAtRisk).toBeNull();
    expect(metrics.unassignedTrips).toBeNull();
    expect(metrics.activeExceptions).toBeNull();
    expect(metrics.onTimePickupPct).toBeNull();
    expect(metrics.onTimeArrivalPct).toBeNull();
    expect(metrics.completedMissingDocuments).toBeNull();
  });

  it("exportTripRows returns the filtered rows without pagination", async () => {
    const { customerId: c, scope, sort, dir } = boardQuery({ scope: "all" });
    const rows = await exportTripRows({ customerId: c, scope, sort, dir } as Parameters<
      typeof exportTripRows
    >[0]);
    expect(rows.length).toBe(createdTripIds.length);
  });

  it("exportTripRows throws Conflict EXPORT_TOO_LARGE when the cap is exceeded", async () => {
    const { customerId: c, scope, sort, dir } = boardQuery({ scope: "all" });
    const query = { customerId: c, scope, sort, dir } as Parameters<typeof exportTripRows>[0];
    let caught: unknown;
    try {
      await exportTripRows(query, 0);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect((caught as { code?: string }).code).toBe("EXPORT_TOO_LARGE");
  });
});
