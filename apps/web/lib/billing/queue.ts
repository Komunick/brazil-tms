import "server-only";
import { PgBoss } from "pg-boss";
import { BILLING_JOBS, type BillingJobName, type BillingJobPayloads } from "@brazil-tms/shared";

/**
 * Feature 008 — BFF-side enqueue client for the on-demand `billing.export` job (R11). The export
 * route validates + writes the `export_batches` row + enqueues; the worker drains the same
 * Postgres-backed queue and does the heavy ExcelJS generation off the request path. Mirrors
 * `lib/imports/queue.ts`: ONE lazily-started PgBoss sender per Next server process.
 */

let bossPromise: Promise<PgBoss> | undefined;

async function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error("DATABASE_URL is required to enqueue billing jobs.");
      }
      const boss = new PgBoss({ connectionString });
      boss.on("error", (err: Error) => console.error("[pg-boss/bff] error", err));
      await boss.start();
      // Ensure the queue exists (idempotent) so send() works even if the worker hasn't booted yet.
      for (const name of Object.values(BILLING_JOBS)) {
        await boss.createQueue(name);
      }
      return boss;
    })();
  }
  return bossPromise;
}

/** Typed enqueue — the only way the BFF should publish a billing job. */
export async function enqueueBillingJob<K extends BillingJobName>(
  name: K,
  data: BillingJobPayloads[K],
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(name, data as object);
}

/** Convenience: enqueue a billing-export run for an export batch. */
export async function enqueueBillingExport(payload: BillingJobPayloads["billing.export"]): Promise<string | null> {
  return enqueueBillingJob(BILLING_JOBS.billingExport, payload);
}
