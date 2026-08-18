import { and, eq, isNull } from "drizzle-orm";
import { lanes } from "../../schema";
import type { DB } from "../client";

/** The live `db` or a transaction handle — lane resolution runs inside the caller's transaction. */
type DbOrTx = Pick<DB, "select" | "insert">;

/**
 * Resolve the lane a trip runs on — and register it the first time it is seen (2026-08-16).
 *
 * `trips.lane_id` existed since 003 and nothing ever wrote it: every import created trips with a null
 * lane, which quietly cost more than a filter. The SLA and exception reports GROUP BY lane, so every
 * row landed under a single "—" bucket; per-lane SLA rules, per-lane rates and per-lane document
 * requirements could be configured but never matched. On the tmsdev data that was 871 trips over 110
 * distinct routes, all of them anonymous.
 *
 * A lane IS its (customer, origin, destination) triple, so the resolution is that triple and the
 * registration is a find-or-create: the customer's programme is what says which routes exist, and
 * asking an operator to pre-register 110 of them by hand before the reports work is the spreadsheet
 * habit this system is meant to end. An auto-created lane carries route identity ONLY — rate,
 * distance and expected transit stay null for the commercial team to fill in on the Rotas screen.
 *
 * Concurrency: two imports can meet on the same new route. The insert is `ON CONFLICT DO NOTHING`
 * against the partial unique index (`lanes_customer_route_uq`, live rows only) and the loser re-reads
 * the winner's row, so the pair resolves to ONE lane either way. `DO NOTHING` (not an error) is what
 * keeps the surrounding transaction alive when that happens.
 *
 * Archived lanes are ignored: an archived route is a decision to stop offering it, and a trip that
 * runs anyway states a live route. It resolves to a new lane rather than resurrecting the old one.
 */
export async function resolveLaneId(
  tx: DbOrTx,
  customerId: string,
  originLocationId: string,
  destinationLocationId: string,
): Promise<string | null> {
  // The degenerate lane (origin = destination) is forbidden by `lanes_origin_dest_ck`. A trip that
  // states one is a data problem upstream; it keeps its null lane rather than failing the import.
  if (originLocationId === destinationLocationId) return null;

  const found = await findLive(tx, customerId, originLocationId, destinationLocationId);
  if (found) return found;

  const inserted = await tx
    .insert(lanes)
    .values({ customerId, originLocationId, destinationLocationId })
    .onConflictDoNothing()
    .returning({ id: lanes.id });
  if (inserted[0]) return inserted[0].id;

  // Lost the race (or hit an archived-row conflict the partial index does not cover) — read again.
  return findLive(tx, customerId, originLocationId, destinationLocationId);
}

async function findLive(
  tx: DbOrTx,
  customerId: string,
  originLocationId: string,
  destinationLocationId: string,
): Promise<string | null> {
  const rows = await tx
    .select({ id: lanes.id })
    .from(lanes)
    .where(
      and(
        eq(lanes.customerId, customerId),
        eq(lanes.originLocationId, originLocationId),
        eq(lanes.destinationLocationId, destinationLocationId),
        isNull(lanes.archivedAt),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}
