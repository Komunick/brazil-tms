import "dotenv/config";
import ExcelJS from "exceljs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { TRANSITIONS, type TripStatus } from "@brazil-tms/shared";
import { alerts, customers, db, tripEvents, trips, users, writeAudit } from "../src";

/**
 * Close the trips that had ALREADY happened when the schedule was imported, using the customer's own
 * `STATUS VIAGEM` column. Run once, after `db:seed:shopee-assign`:
 *   pnpm --filter @brazil-tms/db db:seed:shopee-close -- "C:/caminho/PROGRAMAÇÃO 2026.xlsx"
 *
 * WHY THIS EXISTS. The import deliberately ignores the customer's status columns, so every imported
 * trip is born `received` — correct for the live flow, wrong for a bulk backfill of two past months:
 * to the TMS, 3.3k finished July trips look like trips nobody ever picked up, and the SLA sweep
 * rightly raised ~8k alerts. This closes the historical tail ONCE; the ongoing import keeps ignoring
 * status.
 *
 * HOW IT STAYS HONEST:
 *  - it only ever walks DECLARED transitions (`TRANSITIONS`), never jumps straight to `completed`;
 *  - each hop is written as a `status_change` trip event with `source = 'import'` and a note saying it
 *    is a historical backfill, so nobody later reads them as observed milestones. `event_timestamp`
 *    stays NULL: the workbook records no real milestone times, and we do not invent any;
 *  - one audit row per trip records the whole jump (previous → final) with the source LH;
 *  - alerts on a closed trip move to `resolved` — the sweep's own lifecycle, not a delete.
 *
 * MAPPING (business call 2026-08-14): FINALIZADA/FINALIZADO → `completed`; CANCELADA, NO SHOW and
 * INFRUTÍFERA → `cancelled` (the last two carry their own cancellation reason code). Every other
 * label (EM VIAGEM, ATRIBUÍDO NO SPX, FALTA ATRIBUIR, blank…) is LEFT ALONE — those are the live
 * trips the dispatcher still has to work.
 */

const DEFAULT_PATH = "C:/Users/Victor/Downloads/PROGRAMAÇÃO 2026 _ BRAZIL TRANSPORTS.xlsx";
const CUSTOMER_CODE = "SHOPEE";
const SHEET = { name: "SHOPEE", header: 1 };

/** Customer label → the terminal status we close the trip into (null = leave the trip alone). */
function targetFor(label: string): { status: TripStatus; reasonCode: string } | null {
  const v = label.trim().toUpperCase();
  if (v === "FINALIZADA" || v === "FINALIZADO") return { status: "completed", reasonCode: "" };
  if (v === "CANCELADA") return { status: "cancelled", reasonCode: "CANCELADA_CLIENTE" };
  if (v === "NO SHOW") return { status: "cancelled", reasonCode: "NO_SHOW" };
  if (v === "INFRUTÍFERA" || v === "INFRUTIFERA")
    return { status: "cancelled", reasonCode: "INFRUTIFERA" };
  return null;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) {
      return (value as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    }
    if ("result" in value) {
      const r = (value as ExcelJS.CellFormulaValue).result;
      return r === null || r === undefined ? "" : String(r);
    }
    if ("formula" in value) return "";
    if ("text" in value) return String((value as ExcelJS.CellHyperlinkValue).text);
    return "";
  }
  return String(value);
}

/**
 * Shortest path of DECLARED transitions from `from` to `to` (breadth-first over `TRANSITIONS`).
 * `cancelled` is excluded as an intermediate hop — it is terminal, so it may only be the target.
 */
function pathBetween(from: TripStatus, to: TripStatus): TripStatus[] | null {
  if (from === to) return [];
  const queue: TripStatus[][] = [[from]];
  const seen = new Set<TripStatus>([from]);
  while (queue.length) {
    const path = queue.shift()!;
    const last = path[path.length - 1]!;
    for (const next of TRANSITIONS[last] ?? []) {
      if (seen.has(next)) continue;
      if (next === "cancelled" && to !== "cancelled") continue;
      const extended = [...path, next];
      if (next === to) return extended.slice(1);
      seen.add(next);
      queue.push(extended);
    }
  }
  return null;
}

async function main(): Promise<void> {
  const path = process.argv[2] ?? DEFAULT_PATH;

  const customer = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerCode, CUSTOMER_CODE))
    .limit(1);
  const customerId = customer[0]?.id;
  if (!customerId) throw new Error(`Cliente ${CUSTOMER_CODE} não existe.`);

  const actor = await db.select({ id: users.id }).from(users).limit(1);
  const actorId = actor[0]?.id;
  if (!actorId) throw new Error("Nenhum usuário no banco para registrar a auditoria.");

  const tripRows = await db
    .select({ id: trips.id, externalTripId: trips.externalTripId, status: trips.currentStatus })
    .from(trips)
    .where(eq(trips.customerId, customerId));
  const tripByExternal = new Map(
    tripRows
      .filter((t) => t.externalTripId)
      .map((t) => [t.externalTripId!.trim().toUpperCase(), t]),
  );

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.getWorksheet(SHEET.name);
  if (!sheet) throw new Error(`Aba ${SHEET.name} não encontrada.`);
  const headers: string[] = [];
  sheet.getRow(SHEET.header).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cellText(cell.value).trim();
  });
  const col = (name: string): number => headers.indexOf(name);

  let completed = 0;
  let cancelled = 0;
  let leftOpen = 0;
  let alreadyTerminal = 0;
  let noTrip = 0;
  let noPath = 0;
  const closedTripIds: string[] = [];

  for (let r = SHEET.header + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const lh = cellText(row.getCell(col("LH")).value)
      .trim()
      .toUpperCase();
    const label = cellText(row.getCell(col("STATUS VIAGEM")).value).trim();
    if (!lh || !label) continue;

    const target = targetFor(label);
    if (!target) {
      leftOpen++;
      continue;
    }
    const trip = tripByExternal.get(lh);
    if (!trip) {
      noTrip++;
      continue;
    }
    const current = trip.status as TripStatus;
    if (current === "completed" || current === "cancelled" || current === "billed") {
      alreadyTerminal++;
      continue;
    }
    const hops = pathBetween(current, target.status);
    if (!hops || hops.length === 0) {
      noPath++;
      continue;
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      // One event per DECLARED hop, flagged as the historical backfill it is.
      // Annotated: the terminal-status guard above narrows `current`, and the hops walk past it.
      let before: TripStatus = current;
      const events = hops.map((after) => {
        const event = {
          tripId: trip.id,
          eventType: "status_change" as const,
          statusBefore: before,
          statusAfter: after,
          eventTimestamp: null,
          source: "import" as const,
          actorUserId: actorId,
          notes: `Fechamento histórico da programação Shopee (LH ${lh}, status do cliente: ${label}).`,
        };
        before = after;
        return event;
      });
      await tx.insert(tripEvents).values(events);

      await tx
        .update(trips)
        .set({
          currentStatus: target.status,
          updatedAt: now,
          ...(target.status === "cancelled"
            ? {
                cancelledAt: now,
                cancellationReasonCode: target.reasonCode,
                cancellationResponsibleParty: "customer_caused" as const,
                cancellationBillingImpact: "not_billable",
              }
            : {}),
        })
        .where(eq(trips.id, trip.id));

      await writeAudit(tx, {
        entityType: "trip",
        entityId: trip.id,
        action: "trip.status_change",
        previousValue: { current_status: current },
        newValue: { current_status: target.status, hops },
        actorUserId: actorId,
        reason: `Carga histórica: status "${label}" da programação Shopee (LH ${lh}).`,
      });
    });

    closedTripIds.push(trip.id);
    if (target.status === "completed") completed++;
    else cancelled++;

    if ((completed + cancelled) % 250 === 0) {
      console.log(`  ... ${completed + cancelled} viagens fechadas`);
    }
  }

  // The sweep's own lifecycle: an alert whose trip is closed is resolved, never deleted.
  let resolvedAlerts = 0;
  for (let i = 0; i < closedTripIds.length; i += 500) {
    const chunk = closedTripIds.slice(i, i + 500);
    const res = await db
      .update(alerts)
      .set({ state: "resolved", autoResolvedAt: new Date(), updatedAt: new Date() })
      .where(and(inArray(alerts.tripId, chunk), sql`${alerts.state} <> 'resolved'`))
      .returning({ id: alerts.id });
    resolvedAlerts += res.length;
  }

  console.log("\n=== resultado ===");
  console.log(`concluídas:            ${completed}`);
  console.log(`canceladas:            ${cancelled}`);
  console.log(`alertas resolvidos:    ${resolvedAlerts}`);
  console.log(`deixadas em aberto:    ${leftOpen} (status vivo na planilha)`);
  console.log(`já estavam encerradas: ${alreadyTerminal}`);
  console.log(`sem viagem no TMS:     ${noTrip}`);
  console.log(`sem caminho de status: ${noPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
