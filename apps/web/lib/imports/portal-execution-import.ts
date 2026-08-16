import "server-only";
import { parse as parseCsv } from "csv-parse/sync";
import { and, eq, isNull } from "drizzle-orm";
import {
  parsePortalExecution,
  type PortalParseResult,
  type PortalStopRow,
} from "@brazil-tms/shared";
import { applyPortalExecution, customers, db, type PortalApplySummary } from "@brazil-tms/db";
import { Conflict } from "@/lib/api/respond";

/**
 * The customer's portal export, applied as EXECUTION (2026-08-16). The planning import says what
 * should happen; this says what did — arrival, departure, arrival at the destination, with the
 * instants the customer's own system recorded.
 *
 * Synchronous, like the registry import and for the same reason: a real export is ~600 rows read in
 * one pass, and the summary the screen shows IS the result rather than a promise of one.
 */

export interface PortalImportResult {
  fileName: string;
  rows: number;
  trips: number;
  legs: number;
  summary: PortalApplySummary;
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
  const summary = await applyPortalExecution(
    customerId,
    parsed.trips,
    input.actorUserId,
    input.fileName,
  );

  const unknownStations = [
    ...new Set(
      summary.outcomes
        .filter((o) => o.status === "unknown_station" && o.detail)
        .map((o) => o.detail!),
    ),
  ];

  return {
    fileName: input.fileName,
    rows: rows.length,
    trips: parsed.trips.length,
    legs: parsed.trips.reduce((n, t) => n + t.legs.length, 0),
    summary,
    rejected: parsed.rejected,
    unknownStations,
  };
}
