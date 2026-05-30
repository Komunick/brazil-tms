import "server-only";
import { PgBoss } from "pg-boss";
import { IMPORT_JOBS, type ImportJobName, type ImportJobPayloads } from "@brazil-tms/shared";

/**
 * BFF-side enqueue client (feature 004, research R3/R4). The upload + confirm route handlers enqueue
 * pg-boss jobs onto the same Postgres-backed queue the worker drains. We keep ONE lazily-started
 * PgBoss instance for the Next server process (a sender) — started once, reused across requests. The
 * job names + payload types come from `@brazil-tms/shared` so the BFF and worker share one contract.
 * Heavy work stays in the worker; the BFF only validates, writes the batch row, and enqueues.
 */

let bossPromise: Promise<PgBoss> | undefined;

async function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error("DATABASE_URL is required to enqueue import jobs.");
      }
      const boss = new PgBoss({ connectionString });
      boss.on("error", (err: Error) => console.error("[pg-boss/bff] error", err));
      await boss.start();
      // Ensure the queues exist (idempotent) so send() works even if the worker hasn't booted yet.
      for (const name of Object.values(IMPORT_JOBS)) {
        await boss.createQueue(name);
      }
      return boss;
    })();
  }
  return bossPromise;
}

/** Typed enqueue — the only way the BFF should publish an import job. */
export async function enqueueImportJob<K extends ImportJobName>(
  name: K,
  data: ImportJobPayloads[K],
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(name, data as object);
}
