import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db, type DB } from "../client";
import { rates } from "../../schema";
import type { TripScope } from "../documents/requirements";

/**
 * Feature 008 — rate reads (data-model §11, R4). `resolveRate` picks the single most-specific
 * currently-effective rate for a trip (lane+vehicle-type > single-scope > customer-default, tie-break
 * latest `effective_start`) entirely in the query's ORDER BY … LIMIT 1 — NOT a DB constraint. No match
 * ⇒ null (the caller uses a manual amount + reports billing-rule sign-off blocked, §29 Input #5). The
 * write CRUD (`createRate`/`updateRate`) lands in US4.
 */

type Querier = Pick<DB, "select">;

export type RateRow = typeof rates.$inferSelect;

/**
 * The single applicable rate for a trip, or null. Precedence resolved in the query:
 *  - scope match: `(lane_id IS NULL OR = trip.lane_id) AND (vehicle_type IS NULL OR = trip.vehicle_type)`
 *  - effective window covers the trip's pickup (open-ended on either side)
 *  - order: most-specific first (`lane_id NOT NULL`, then `vehicle_type NOT NULL`), tie-break latest
 *    `effective_start` (NULLS LAST), LIMIT 1.
 */
export async function resolveRate(
  trip: Pick<TripScope, "customerId" | "laneId" | "plannedVehicleType"> & {
    plannedPickupWindowStart?: Date | null;
  },
  executor: Querier = db,
): Promise<RateRow | null> {
  const at = trip.plannedPickupWindowStart ?? new Date();

  const laneCond = trip.laneId
    ? or(isNull(rates.laneId), eq(rates.laneId, trip.laneId))
    : isNull(rates.laneId);
  const vtCond = trip.plannedVehicleType
    ? or(
        isNull(rates.vehicleType),
        eq(rates.vehicleType, trip.plannedVehicleType as (typeof rates.vehicleType.enumValues)[number]),
      )
    : isNull(rates.vehicleType);

  const rows = await executor
    .select()
    .from(rates)
    .where(
      and(
        eq(rates.customerId, trip.customerId),
        eq(rates.active, true),
        or(isNull(rates.effectiveStart), lte(rates.effectiveStart, at)),
        or(isNull(rates.effectiveEnd), gte(rates.effectiveEnd, at)),
        laneCond,
        vtCond,
      ),
    )
    .orderBy(
      sql`(${rates.laneId} IS NOT NULL) DESC`,
      sql`(${rates.vehicleType} IS NOT NULL) DESC`,
      sql`${rates.effectiveStart} DESC NULLS LAST`,
    )
    .limit(1);

  return rows[0] ?? null;
}

/** List rates (admin), optionally filtered by customer. */
export async function listRates(
  filters: { customerId?: string } = {},
  executor: Querier = db,
): Promise<RateRow[]> {
  const base = executor.select().from(rates);
  return filters.customerId
    ? base.where(eq(rates.customerId, filters.customerId))
    : base;
}
