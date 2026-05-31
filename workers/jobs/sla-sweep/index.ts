import { type PgBoss } from "pg-boss";
import { eq, inArray } from "drizzle-orm";
import { db } from "@brazil-tms/db/client";
import { recomputeTripSla, trips } from "@brazil-tms/db";
import { ACTIVE_TRIP_STATUSES, type SlaSweepPayload } from "@brazil-tms/shared";
import { JOB, work } from "../../lib/queue";

/**
 * Feature 007 — the SLA sweep (the FIRST scheduled worker job; data-model §14, R10/R11). On the
 * existing single worker + pg-boss queue, a ~5-min cron recomputes server-authoritative SLA risk for
 * purely time-based triggers (delayed origin/destination arrival, missed confirmation, delayed
 * loading/departure) that no user action would otherwise flip. It is the time-based complement to the
 * synchronous in-mutation `recomputeTripSla` (milestones/exceptions/assignment).
 *
 * Safety/observability: only ACTIVE (non-terminal) trips; processed in chunks; EACH trip in its own
 * transaction under a `SELECT … FOR UPDATE` row lock (safe with the concurrent synchronous BFF recalc
 * — last-writer-wins on identical deterministic inputs) with per-trip try/catch fault isolation
 * (skip-and-continue, never abort the sweep); a structured per-sweep summary log. Alert generation is
 * added by US4 (T078).
 */

/** Max trips locked+recomputed per chunk (keeps each tx + lock window small). */
export const SLA_SWEEP_CHUNK_SIZE = 200;

export interface SlaSweepSummary {
  durationMs: number;
  evaluated: number;
  changed: number;
  errors: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Recompute one trip's SLA under a row lock, in its own transaction. Returns whether `sla_status`
 * actually changed (for the summary's `changed` count). Throws on DB error (the caller isolates it).
 */
async function sweepTrip(tripId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const before = await tx
      .select({ s: trips.slaStatus })
      .from(trips)
      .where(eq(trips.id, tripId))
      .for("update")
      .limit(1);
    await recomputeTripSla(tx, tripId);
    const after = await tx.select({ s: trips.slaStatus }).from(trips).where(eq(trips.id, tripId)).limit(1);
    return (before[0]?.s ?? null) !== (after[0]?.s ?? null);
  });
}

/**
 * Run one SLA sweep over all active trips. Per-trip fault isolation: a bad trip is logged and skipped,
 * the sweep continues. Emits + returns a structured summary. `_payload` is unused (scheduled cron has
 * no per-run input).
 */
export async function runSlaSweep(_payload?: SlaSweepPayload): Promise<SlaSweepSummary> {
  const startedAt = Date.now();

  const activeRows = await db
    .select({ id: trips.id })
    .from(trips)
    .where(inArray(trips.currentStatus, [...ACTIVE_TRIP_STATUSES]));
  const ids = activeRows.map((r) => r.id);

  let evaluated = 0;
  let changed = 0;
  let errors = 0;

  for (const batch of chunk(ids, SLA_SWEEP_CHUNK_SIZE)) {
    for (const tripId of batch) {
      try {
        const didChange = await sweepTrip(tripId);
        evaluated += 1;
        if (didChange) changed += 1;
      } catch (err) {
        errors += 1;
        console.error("[sla-sweep] trip failed (skipped):", tripId, err);
      }
    }
  }

  const summary: SlaSweepSummary = { durationMs: Date.now() - startedAt, evaluated, changed, errors };
  console.log(
    `[sla-sweep] done duration_ms=${summary.durationMs} evaluated=${summary.evaluated} changed=${summary.changed} errors=${summary.errors}`,
  );
  return summary;
}

/**
 * Register + schedule the sweep on the worker's pg-boss instance. The queue is created at bootstrap
 * (`setupQueues` iterates the merged `JOB` map, which now includes `sla.sweep`). `work` consumes the
 * job; `boss.schedule` enqueues it on the cron (default every 5 min, overridable via `SLA_SWEEP_CRON`).
 * This is the first-ever `boss.schedule` usage in the codebase.
 */
export async function registerSlaSweep(boss: PgBoss): Promise<void> {
  await work(boss, JOB.slaSweep, async () => {
    await runSlaSweep();
  });
  const cron = process.env.SLA_SWEEP_CRON ?? "*/5 * * * *";
  await boss.schedule(JOB.slaSweep, cron, {}, {});
}
