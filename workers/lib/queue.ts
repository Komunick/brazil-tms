import { PgBoss, type Job } from "pg-boss";

/**
 * pg-boss queue surface for the import worker (feature 004, research R1/R3). One Node worker, one
 * Postgres-backed queue (no Redis/broker — STACK §3.11). Job names + typed payloads live here so the
 * BFF (`apps/web/lib/imports/*`) and the worker share one contract. The pipeline jobs chain on
 * success: parse → validate → detect-duplicates (→ generate-error-report when there are errors);
 * confirm-import is enqueued by the user's confirm action.
 */

export const JOB = {
  parse: "import.parse",
  validate: "import.validate",
  detectDuplicates: "import.detect-duplicates",
  generateErrorReport: "import.generate-error-report",
  confirm: "import.confirm",
} as const;

export type JobName = (typeof JOB)[keyof typeof JOB];

export interface ParsePayload {
  batchId: string;
  storageKey: string;
}
export interface ValidatePayload {
  batchId: string;
}
export interface DetectDuplicatesPayload {
  batchId: string;
}
export interface GenerateErrorReportPayload {
  batchId: string;
}
export interface ConfirmPayload {
  batchId: string;
  actorUserId: string;
}

export interface JobPayloads {
  "import.parse": ParsePayload;
  "import.validate": ValidatePayload;
  "import.detect-duplicates": DetectDuplicatesPayload;
  "import.generate-error-report": GenerateErrorReportPayload;
  "import.confirm": ConfirmPayload;
}

/** Construct the pg-boss instance against the worker's DATABASE_URL (server/worker-only). */
export function createBoss(): PgBoss {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the import worker (pg-boss).");
  }
  return new PgBoss({ connectionString });
}

/** Create every import queue (idempotent). Must run after `boss.start()` and before send/work. */
export async function setupQueues(boss: PgBoss): Promise<void> {
  for (const name of Object.values(JOB)) {
    await boss.createQueue(name);
  }
}

/** Typed enqueue helper — the only way the BFF/worker should publish a job. */
export async function enqueue<K extends JobName>(
  boss: PgBoss,
  name: K,
  data: JobPayloads[K],
): Promise<string | null> {
  return boss.send(name, data as object);
}

/**
 * Typed worker registration. pg-boss delivers a batch array; we unwrap and run the handler per job
 * so each import stage stays a simple `(payload) => Promise<void>`. A throw makes pg-boss retry the
 * job (handlers are idempotent — STACK §3.11).
 */
export async function work<K extends JobName>(
  boss: PgBoss,
  name: K,
  handler: (data: JobPayloads[K]) => Promise<void>,
): Promise<void> {
  await boss.work<JobPayloads[K]>(name, async (jobs: Job<JobPayloads[K]>[]) => {
    for (const job of jobs) {
      await handler(job.data);
    }
  });
}
