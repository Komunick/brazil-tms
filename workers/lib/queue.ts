import { PgBoss, type Job } from "pg-boss";
import {
  BILLING_JOBS,
  DOCUMENT_JOBS,
  IMPORT_JOBS,
  PORTAL_JOBS,
  PRE_SM_JOBS,
  SLA_JOBS,
  TURNO_JOBS,
  type BillingJobName,
  type BillingJobPayloads,
  type DocumentJobName,
  type DocumentJobPayloads,
  type ImportJobName,
  type ImportJobPayloads,
  type PortalJobName,
  type PortalJobPayloads,
  type PreSmJobName,
  type PreSmJobPayloads,
  type SlaJobName,
  type SlaJobPayloads,
  type TurnoJobName,
  type TurnoJobPayloads,
} from "@brazil-tms/shared";

/**
 * pg-boss queue surface for the single worker (features 004 + 007, research R1/R3/R10). One Node
 * worker, one Postgres-backed queue (no Redis/broker — STACK §3.11). Job names + typed payloads are
 * the shared contract in `@brazil-tms/shared`; this module adds the worker-side pg-boss plumbing.
 *
 * The import pipeline jobs chain on success (parse → validate → detect-duplicates → optional
 * generate-error-report; confirm is enqueued by the user). Feature 007 merges the SLA sweep job
 * (`sla.sweep`) — the first SCHEDULED (cron) job — into the same `JOB`/`JobName`/`JobPayloads`
 * surface and the bootstrap queue-creation loop.
 */

/**
 * The merged job-name → queue-name map (import pipeline + the 007 SLA sweep + the 008 on-demand
 * `billing.export` and the second scheduled job `documents.checks`).
 */
export const JOB = {
  ...IMPORT_JOBS,
  ...SLA_JOBS,
  ...BILLING_JOBS,
  ...DOCUMENT_JOBS,
  ...PORTAL_JOBS,
  ...PRE_SM_JOBS,
  ...TURNO_JOBS,
} as const;

export type JobName =
  | ImportJobName
  | SlaJobName
  | BillingJobName
  | DocumentJobName
  | PortalJobName
  | PreSmJobName
  | TurnoJobName;
export type JobPayloads = ImportJobPayloads &
  SlaJobPayloads &
  BillingJobPayloads &
  DocumentJobPayloads &
  PortalJobPayloads &
  PreSmJobPayloads &
  TurnoJobPayloads;

/** Construct the pg-boss instance against the worker's DATABASE_URL (server/worker-only). */
export function createBoss(): PgBoss {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the worker (pg-boss).");
  }
  return new PgBoss({ connectionString });
}

/** Create every queue (idempotent). Must run after `boss.start()` and before send/work/schedule. */
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
 * so each stage stays a simple `(payload) => Promise<void>`. A throw makes pg-boss retry the job
 * (handlers are idempotent — STACK §3.11).
 */
export async function work<K extends JobName>(
  boss: PgBoss,
  name: K,
  handler: (data: JobPayloads[K]) => Promise<void>,
): Promise<void> {
  await boss.work<JobPayloads[K]>(name, async (jobs: Job<JobPayloads[K]>[]) => {
    for (const job of jobs) {
      try {
        await handler(job.data);
      } catch (error) {
        /**
         * A falha vai para o LOG antes de ir para o pg-boss (2026-08-18).
         *
         * O pg-boss já guardava tudo: estado `failed` e a pilha inteira na coluna `output` da
         * tabela. Só que ninguém opera lendo tabela de fila — quem opera lê o log. O resultado foi
         * uma varredura agendada falhando de meia em meia hora, quatro vezes seguidas, por uma
         * variável de ambiente que faltava no worker, e NENHUMA linha em lugar nenhum que alguém
         * fosse olhar. Só apareceu porque fui procurar de propósito.
         *
         * O erro é relançado logo em seguida: quem decide o que fazer com a falha continua sendo o
         * pg-boss (marcar, repetir, desistir). Isto aqui só garante que ela seja VISTA.
         */
        console.error(
          JSON.stringify({
            job: name,
            jobId: job.id,
            erro: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack?.split("\n").slice(0, 4).join(" | ") : null,
          }),
        );
        throw error;
      }
    }
  });
}
