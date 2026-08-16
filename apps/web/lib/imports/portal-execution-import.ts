import "server-only";
import { parse as parseCsv } from "csv-parse/sync";
import { and, eq, isNull } from "drizzle-orm";
import {
  parsePortalExecution,
  type PortalParseResult,
  type PortalStopRow,
} from "@brazil-tms/shared";
import {
  applyPortalExecution,
  applyPortalPlan,
  customers,
  db,
  importBatches,
  type PortalApplySummary,
  type PortalPlanSummary,
} from "@brazil-tms/db";
import { putOriginal } from "@/lib/supabase/storage";
import { Conflict } from "@/lib/api/respond";

/**
 * The customer's portal export, applied as EXECUTION (2026-08-16). The planning import says what
 * should happen; this says what did — arrival, departure, arrival at the destination, with the
 * instants the customer's own system recorded.
 *
 * Synchronous, like the registry import and for the same reason: a real export is ~600 rows read in
 * one pass, and the summary the screen shows IS the result rather than a promise of one.
 */

/**
 * WHICH export was uploaded, and therefore what it is allowed to do. The portal has two tabs and
 * they mean different things: "Planejado" is the plan (it may create trips), "Concluído" is what
 * already happened (it may never create — running it as a plan would manufacture thousands of
 * finished trips nobody can act on). The operator picks; the TMS does not guess from the contents.
 */
export type PortalImportMode = "plan" | "execution";

export interface PortalImportResult {
  fileName: string;
  mode: PortalImportMode;
  rows: number;
  trips: number;
  legs: number;
  summary: PortalApplySummary | null;
  planSummary: PortalPlanSummary | null;
  rejected: PortalParseResult["rejected"];
  /** The stations the file names that no TMS location claims — the operator's to-do list. */
  unknownStations: string[];
}

/** The customer whose portal this is. Resolved by code so the route needs no id in the body. */
async function shopeeCustomerId(customerCode: string): Promise<string> {
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.customerCode, customerCode), isNull(customers.archivedAt)))
    .limit(1);
  const id = rows[0]?.id;
  if (!id) {
    throw new Conflict("UNKNOWN_CUSTOMER", `Cliente ${customerCode} não encontrado.`);
  }
  return id;
}

export async function importPortalExecution(input: {
  fileName: string;
  bytes: Buffer;
  customerCode: string;
  actorUserId: string;
  mode: PortalImportMode;
}): Promise<PortalImportResult> {
  let rows: PortalStopRow[];
  try {
    rows = parseCsv(input.bytes, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as PortalStopRow[];
  } catch (error) {
    throw new Conflict("UNREADABLE_FILE", `Não foi possível ler o arquivo: ${String(error)}`);
  }

  if (rows.length === 0) {
    throw new Conflict("EMPTY_FILE", "O arquivo não tem linhas.");
  }
  // The export's own header, which is also how we refuse the WRONG export: the planning file and
  // the check-in report both open with different columns.
  if (rows[0]!["LH Trip Number"] === undefined || rows[0]!.Station === undefined) {
    throw new Conflict(
      "UNEXPECTED_COLUMNS",
      "Este não parece o export de viagens do portal: faltam as colunas 'LH Trip Number' e 'Station'.",
    );
  }

  const customerId = await shopeeCustomerId(input.customerCode);
  const parsed = parsePortalExecution(rows);

  /**
   * The import is recorded BEFORE it applies, and the original file is kept, so a run that dies
   * halfway still leaves a trace of what was attempted. The result used to live only on the screen
   * of whoever clicked — one interruption and "12 estações não resolvidas" was gone for good.
   */
  const batchId = crypto.randomUUID();
  const storageKey = await putOriginal(batchId, input.bytes, "text/csv");
  await db.insert(importBatches).values({
    id: batchId,
    customerId,
    fileName: input.fileName,
    storageKey,
    uploadedBy: input.actorUserId,
    source: input.mode === "plan" ? "portal_plan" : "portal_execution",
    status: "confirming",
    totalRows: rows.length,
  });

  // The plan mode creates trips and then records anything the same file already proves; the
  // execution mode only records. The difference is the operator's choice, never a guess.
  const planSummary =
    input.mode === "plan"
      ? await applyPortalPlan(customerId, parsed.trips, input.actorUserId, input.fileName)
      : null;
  const summary =
    input.mode === "execution"
      ? await applyPortalExecution(customerId, parsed.trips, input.actorUserId, input.fileName)
      : null;

  const unknownStations = [
    ...new Set(
      [...(summary?.outcomes ?? []), ...(planSummary?.outcomes ?? [])]
        .filter((o) => o.status === "unknown_station" && o.detail)
        .map((o) => o.detail!),
    ),
  ];

  const result: PortalImportResult = {
    fileName: input.fileName,
    mode: input.mode,
    rows: rows.length,
    trips: parsed.trips.length,
    legs: parsed.trips.reduce((n, t) => n + t.legs.length, 0),
    summary,
    planSummary,
    rejected: parsed.rejected,
    unknownStations,
  };

  // Close the record with what actually happened. The five count columns carry what the history
  // table shows at a glance; `summary` keeps the rest — including the station list, which is the
  // only part of this an operator has to act on.
  await db
    .update(importBatches)
    .set({
      status: "completed",
      createdCount: planSummary?.created ?? summary?.applied ?? 0,
      updatedCount: planSummary?.updated ?? 0,
      duplicateCount: planSummary?.unchanged ?? summary?.alreadyAhead ?? 0,
      errorCount: (planSummary?.failed ?? 0) + unknownStations.length + parsed.rejected.length,
      summary: {
        mode: input.mode,
        trips: result.trips,
        legs: result.legs,
        plan: planSummary ? { ...planSummary, outcomes: undefined } : null,
        execution: summary ? { ...summary, outcomes: undefined } : null,
        unknownStations,
        rejected: parsed.rejected.slice(0, 50),
      },
      updatedAt: new Date(),
    })
    .where(eq(importBatches.id, batchId));

  return result;
}
