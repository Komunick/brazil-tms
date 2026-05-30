import type { PgBoss } from "pg-boss";

/**
 * Registry of import job handlers (feature 004, research R3). The bootstrap (`workers/index.ts`)
 * calls this once after the queues are created. Each job lands in its own folder under `jobs/` and
 * is wired here as it is implemented:
 *   - US1: parse → validate → detect-duplicates (chained pipeline) + confirm-import
 *   - US2: generate-error-report (enqueued by detect-duplicates when error_count > 0)
 *
 * Keeping registration in this one module means the story slices add a job by editing their own
 * `jobs/<name>/index.ts` plus one line here — never the pg-boss bootstrap.
 */
export async function registerJobHandlers(_boss: PgBoss): Promise<void> {
  // US1 (T030–T033):
  //   await registerParse(_boss);
  //   await registerValidate(_boss);
  //   await registerDetectDuplicates(_boss);
  //   await registerConfirm(_boss);
  // US2 (T041):
  //   await registerGenerateErrorReport(_boss);
}
