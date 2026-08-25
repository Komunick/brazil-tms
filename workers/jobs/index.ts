import type { PgBoss } from "pg-boss";
import { registerParse } from "./parse";
import { registerValidate } from "./validate";
import { registerDetectDuplicates } from "./detect-duplicates";
import { registerGenerateErrorReport } from "./generate-error-report";
import { registerConfirm } from "./confirm-import";
import { registerSlaSweep } from "./sla-sweep";
import { registerDocumentChecks } from "./document-checks";
import { registerBillingExport } from "./billing-export";
import { registerPortalWithdrawn } from "./portal-withdrawn";
import { registerPreSmCriar } from "./pre-sm";

/**
 * Registry of import job handlers (feature 004, research R3). The bootstrap (`workers/index.ts`)
 * calls this once after the queues are created. Each job lands in its own folder under `jobs/` and
 * is wired here as it is implemented:
 *   - US1: parse → validate → detect-duplicates (chained pipeline) + confirm-import
 *   - US2: generate-error-report (enqueued by detect-duplicates when error_count > 0)
 *
 * Keeping registration in this one module means the story slices add a job by editing their own
 * `jobs/<name>/index.ts` plus one line here — never the pg-boss bootstrap. Each `register*` wires the
 * handler via the queue `work()` helper AND enqueues the next pipeline stage on success (the chaining
 * lives in the register wrapper, never in the pure `run*` core).
 */
export async function registerJobHandlers(boss: PgBoss): Promise<void> {
  // US1 (T030–T033):
  await registerParse(boss);
  await registerValidate(boss);
  await registerDetectDuplicates(boss);
  await registerConfirm(boss);
  // US2 (T041):
  await registerGenerateErrorReport(boss);
  // Feature 007 (T070): the first SCHEDULED job — the ~5-min SLA-risk sweep over active trips.
  await registerSlaSweep(boss);
  // Feature 008 (T065): the SECOND scheduled job — the ~5-min document-checks sweep (the two §17 cases).
  await registerDocumentChecks(boss);
  // Feature 008 (T094): the on-demand billing-export job (heavy ExcelJS generation off the request path).
  await registerBillingExport(boss);
  // 2026-08-18: o TERCEIRO job agendado — a varredura das viagens que o cliente retirou do portal.
  await registerPortalWithdrawn(boss);
  /**
   * 2026-08-25 (026): a Pré-SM na gerenciadora Logae.
   *
   * ENFILEIRADO POR EVENTO, não agendado — ao contrário dos três acima. A ordem de atribuição
   * voltando confirmada do portal é o único momento em que a atribuição existe dos dois lados e
   * todos os campos estão disponíveis.
   *
   * Nasce DESLIGADO por variável de ambiente, com teto diário em zero: a gerenciadora cobra por
   * solicitação e não tem homologação para nós. Ver `pre-sm/index.ts`.
   */
  await registerPreSmCriar(boss);
}
