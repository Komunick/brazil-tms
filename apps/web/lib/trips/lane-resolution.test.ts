import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  auditLogs,
  createTrip,
  customers,
  db,
  lanes,
  locations,
  resolveLaneId,
  trips,
  users,
} from "@brazil-tms/db";

/**
 * A trip must know which route it runs on. `trips.lane_id` existed since 003 and no writer ever set
 * it, which left the per-lane SLA rules, rates, document requirements and report grouping with
 * nothing to match. `createTrip` now resolves the lane from (customer, origin, destination) and
 * registers the route the first time it is seen.
 *
 * Skips without DATABASE_URL, like the other integration tests here.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("lane resolution on trip create (integration)", () => {
  let customerId = "";
  let originId = "";
  let destId = "";
  let thirdId = "";
  let actorId = "";

  const createdTripIds: string[] = [];
  const token = `LN${Date.now()}${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    customerId = (
      await db
        .insert(customers)
        .values({ name: `Cliente rota ${token}`, customerCode: `LANE-${token}` })
        .returning({ id: customers.id })
    )[0]!.id;

    const locs = await db
      .insert(locations)
      .values([
        { customerId, code: `LO-${token}`, name: `Origem ${token}` },
        { customerId, code: `LD-${token}`, name: `Destino ${token}` },
        { customerId, code: `LT-${token}`, name: `Terceiro ${token}` },
      ])
      .returning({ id: locations.id });
    originId = locs[0]!.id;
    destId = locs[1]!.id;
    thirdId = locs[2]!.id;

    actorId = (
      await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, "admin@braziltransports.com.br"))
        .limit(1)
    )[0]!.id;
  });

  afterAll(async () => {
    if (createdTripIds.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, createdTripIds));
      await db.delete(trips).where(inArray(trips.id, createdTripIds));
    }
    await db.delete(lanes).where(eq(lanes.customerId, customerId));
    await db.delete(auditLogs).where(eq(auditLogs.entityId, customerId));
    await db.delete(locations).where(eq(locations.customerId, customerId));
    await db.delete(customers).where(eq(customers.id, customerId));
  });

  // The external id is claimed BEFORE the await: two concurrent seeds must not race onto the same
  // one (`trips_customer_external_id_uq` would reject the loser and mask what we are testing).
  let seq = 0;
  async function seed(origin: string, destination: string): Promise<string> {
    const externalTripId = `${token}-${seq++}`;
    const trip = await createTrip(
      { customerId, originLocationId: origin, destinationLocationId: destination, externalTripId },
      actorId,
    );
    createdTripIds.push(trip.id);
    return trip.laneId ?? "";
  }

  it("registers the route the first time it is seen and reuses it afterwards", async () => {
    const first = await seed(originId, destId);
    expect(first).not.toBe("");

    const second = await seed(originId, destId);
    expect(second).toBe(first);

    // Only ONE lane exists for the pair — a second registration would split the lane's history.
    const rows = await db
      .select({ id: lanes.id })
      .from(lanes)
      .where(
        and(
          eq(lanes.customerId, customerId),
          eq(lanes.originLocationId, originId),
          eq(lanes.destinationLocationId, destId),
          isNull(lanes.archivedAt),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("gives a different route its own lane, and direction matters", async () => {
    const outbound = await seed(originId, thirdId);
    const inbound = await seed(thirdId, originId);
    expect(outbound).not.toBe(inbound);
  });

  it("an auto-registered lane carries route identity only — commercial fields stay empty", async () => {
    const laneId = await seed(originId, destId);
    const lane = (await db.select().from(lanes).where(eq(lanes.id, laneId)).limit(1))[0]!;
    expect(lane.expectedTransitMinutes).toBeNull();
    expect(lane.standardRateCents).toBeNull();
    expect(lane.standardDistanceKm).toBeNull();
  });

  it("two concurrent imports of a new route still resolve to one lane", async () => {
    // The race the partial unique index + ON CONFLICT DO NOTHING exists for: both transactions see
    // no lane, both insert, one loses — and must come back with the winner's id, not an error.
    const [a, b] = await Promise.all([seed(destId, thirdId), seed(destId, thirdId)]);
    expect(a).toBe(b);
    expect(a).not.toBe("");
  });

  it("an archived lane is stepped over, not resurrected", async () => {
    const before = await seed(thirdId, destId);
    await db.update(lanes).set({ archivedAt: new Date() }).where(eq(lanes.id, before));

    const after = await seed(thirdId, destId);
    expect(after).not.toBe(before);
    expect(after).not.toBe("");
  });

  it("never invents the degenerate lane (origin = destination)", async () => {
    // Unreachable through createTrip — `trips_origin_dest_ck` rejects such a trip first — but the
    // resolver is a public helper and `lanes_origin_dest_ck` would abort whatever transaction called
    // it. It answers "no lane" instead.
    const laneId = await resolveLaneId(db, customerId, originId, originId);
    expect(laneId).toBeNull();
  });
});
