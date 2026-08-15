import "dotenv/config";
import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import type { TripStatus } from "@brazil-tms/shared";
import {
  customers,
  db,
  importTemplates,
  locationAliases,
  locations,
  statusMappings,
  users,
} from "../src";

/**
 * The Shopee trip-import template + the location aliases its file values need (feature 004; R8,
 * Constitution V — config, never per-customer code). Run AFTER `db:seed:shopee` (which loads the
 * customer, the sites and the fleet):
 *   pnpm --filter @brazil-tms/db db:seed:shopee-template "C:/caminho/PROGRAMAÇÃO 2026.xlsx"
 *
 * Two things the workbook forces us to configure:
 *
 *  1. STATION VALUES CARRY CODE + NAME ("SOC-BA2 | SOC_BA_SIMOES FILHO") while `locations.code` is
 *     just "SOC-BA2". The engine has no per-column transform (by design), so each distinct file
 *     value is taught ONCE as a `location_aliases` row — exactly the mechanism 004 built for this.
 *     Aliases are derived here from the SHOPEE sheet so the first import resolves every station it
 *     already knows; anything new still surfaces as UNKNOWN_LOCATION for a human to map.
 *
 *  2. DATES ARRIVE AS NATIVE EXCEL DATES, which the parser stringifies to ISO with a Z suffix. The
 *     wall-clock in that string is São Paulo local time, so `dateFormats` lists the ISO shapes
 *     FIRST and `timezone` pins the interpretation — without it the whole schedule shifts 3 hours.
 *
 * Status: `STATUS VIAGEM` drives the trip's lifecycle in TWO ways, both config, both here.
 *  - `closedStatusLabels` (on the template) names the words that mean "over": FINALIZADA, CANCELADA,
 *    NO SHOW, INFRUTÍFERA. Those rows are skipped or close the trip they match.
 *  - `STATUS_MAPPINGS` (rows in `status_mappings`) names where a RUNNING trip is. Reading the column
 *    only to close left 54 trips showing "Atribuída" — and raising a missed-arrival alert — while the
 *    file said `EM VIAGEM` and the truck was on the road. The import moves such a trip FORWARD only,
 *    and never past `received` unless it actually has a driver (see `advanceTripFromSource`).
 * Together these cover the WHOLE vocabulary the real file uses; `STATUS` and `DOCA` stay ignored.
 */

const DEFAULT_PATH = "C:/Users/Victor/Downloads/PROGRAMAÇÃO 2026 _ BRAZIL TRANSPORTS.xlsx";
const CUSTOMER_CODE = "SHOPEE";
const TEMPLATE_NAME = "Programação Shopee";
const SHEET = { name: "SHOPEE", header: 1 };

/** The columns we consume: the plan, who runs it, the customer's own fields, and its lifecycle. */
const COLUMN_MAPPINGS = [
  // --- the trip plan --------------------------------------------------------------------------
  { source: "LH", target: "externalTripId", required: true },
  { source: "ESTAÇÃO ORIGEM", target: "originCode", required: true },
  { source: "ESTAÇÃO DESTINO", target: "destinationCode", required: true },
  { source: "ETA ORIGEM", target: "plannedPickupWindowStart" },
  { source: "CPT ORIGEM", target: "plannedPickupWindowEnd" },
  { source: "ETA DESTINO", target: "plannedDeliveryWindowStart" },
  { source: "PERFIL", target: "plannedVehicleType" },
  // --- who runs it: linked on confirm against the registry (`resource.*`) ----------------------
  // The CPF column is a VLOOKUP into the MOTORISTAS tab and usually exports empty, so the NAME is
  // the working key — the same one the spreadsheet itself matches on. CPF is kept for when it does
  // come filled: it disambiguates two drivers who share a name.
  { source: "MOTORISTA", target: "resource.driverName" },
  { source: "CPF", target: "resource.driverCpf" },
  { source: "CAVALO", target: "resource.vehiclePlate" },
  { source: "CARRETA", target: "resource.trailerPlate" },
  // --- the customer's own columns: shown on the trip, no field of their own (`customer.*`) ------
  { source: "REGIÃO", target: "customer.Região" },
  { source: "SOLICITAÇÃO", target: "customer.Solicitação" },
  { source: "CHECKLIST", target: "customer.Checklist" },
  { source: "SM RASTER", target: "customer.SM Raster" },
  { source: "CTE", target: "customer.CT-e" },
  // --- the customer's lifecycle: used ONLY to skip/close, never to drive the TMS status ----------
  // Reversal of the 2026-08-14 "ignore status" call, agreed 2026-08-15: the schedule is cumulative,
  // so 3.265 of 3.724 rows describe trips that already ended. Reading the label lets the confirm skip
  // those and close the ones the TMS already has, instead of flooding the queue and the SLA alerts.
  { source: "STATUS VIAGEM", target: "statusLabel" },
  // DOCA and STATUS (the other status column) stay out: one lifecycle source is enough.
];

/** The customer's words for "this trip is over" (accent/case-insensitive at match time). */
const CLOSED_STATUS_LABELS = ["FINALIZADA", "FINALIZADO", "CANCELADA", "NO SHOW", "INFRUTÍFERA"];

/**
 * The customer's words for where a trip currently IS → the internal status. Every label the real
 * file carries that does NOT mean "over"; a blank cell maps to nothing and leaves the trip alone.
 *
 * "ATRIBUÍDO NO SPX" is the customer's own system saying the driver is set — which is `assigned`
 * here, and it is reached only when the file also named a driver we could link. "ETA ORIGEM"/"ETA
 * DESTINO" mean the truck reached that end; the walk passes through the declared intermediate
 * states, so a trip that jumps from `assigned` to `ETA DESTINO` still records confirmed → at_origin
 * → in_transit → at_destination rather than teleporting.
 */
const STATUS_MAPPINGS: { label: string; status: TripStatus }[] = [
  { label: "FALTA ATRIBUIR", status: "received" },
  { label: "ATRIBUÍDO NO SPX", status: "assigned" },
  { label: "ETA ORIGEM", status: "at_origin" },
  { label: "EM VIAGEM", status: "in_transit" },
  { label: "ETA DESTINO", status: "at_destination" },
];

const PARSING_RULES = {
  // ISO first (native Excel dates), then the hand-typed shapes the file actually contains.
  dateFormats: [
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    "yyyy-MM-dd'T'HH:mm:ss'Z'",
    "dd/MM/yyyy HH:mm",
    "dd/MM/yyyy HH:mm:ss",
    "d/M/yyyy HH:mm",
    "dd-MM-yyyy HH:mm",
    "dd/MM/yyyy",
  ],
  timezone: "America/Sao_Paulo",
  decimalSeparator: ",",
  thousandSeparator: ".",
};

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

async function main(): Promise<void> {
  const path = process.argv[2] ?? DEFAULT_PATH;

  const customer = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerCode, CUSTOMER_CODE))
    .limit(1);
  const customerId = customer[0]?.id;
  if (!customerId)
    throw new Error(`Cliente ${CUSTOMER_CODE} não existe — rode db:seed:shopee antes.`);

  const admin = await db.select({ id: users.id }).from(users).limit(1);
  const actorId = admin[0]?.id;
  if (!actorId) throw new Error("Nenhum usuário no banco para registrar quem criou os apelidos.");

  // ---- template -----------------------------------------------------------------------------
  const existing = await db
    .select({ id: importTemplates.id })
    .from(importTemplates)
    .where(and(eq(importTemplates.customerId, customerId), eq(importTemplates.name, TEMPLATE_NAME)))
    .limit(1);

  const values = {
    customerId,
    name: TEMPLATE_NAME,
    version: 1,
    fileType: "xlsx",
    columnMappings: COLUMN_MAPPINGS,
    parsingRules: PARSING_RULES,
    requiredOverrides: [] as string[],
    closedStatusLabels: CLOSED_STATUS_LABELS,
    active: true,
  };

  if (existing[0]) {
    await db
      .update(importTemplates)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(importTemplates.id, existing[0].id));
    console.log(`template "${TEMPLATE_NAME}" atualizado (${existing[0].id})`);
  } else {
    const inserted = await db
      .insert(importTemplates)
      .values(values)
      .returning({ id: importTemplates.id });
    console.log(`template "${TEMPLATE_NAME}" criado (${inserted[0]!.id})`);
  }

  // ---- status vocabulary (status_mappings) -----------------------------------------------------
  let statusCreated = 0;
  let statusUpdated = 0;
  for (const { label, status } of STATUS_MAPPINGS) {
    const existing = await db
      .select({ id: statusMappings.id })
      .from(statusMappings)
      .where(
        and(eq(statusMappings.customerId, customerId), eq(statusMappings.customerLabel, label)),
      )
      .limit(1);
    if (existing[0]) {
      await db
        .update(statusMappings)
        .set({ internalStatus: status, active: true, archivedAt: null, updatedAt: new Date() })
        .where(eq(statusMappings.id, existing[0].id));
      statusUpdated++;
    } else {
      await db
        .insert(statusMappings)
        .values({ customerId, customerLabel: label, internalStatus: status, active: true });
      statusCreated++;
    }
  }
  console.log(`status do cliente: ${statusCreated} criados, ${statusUpdated} atualizados`);

  // ---- location aliases ----------------------------------------------------------------------
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.getWorksheet(SHEET.name);
  if (!sheet) throw new Error(`Aba ${SHEET.name} não encontrada.`);

  const headers: string[] = [];
  sheet.getRow(SHEET.header).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cellText(cell.value).trim();
  });
  const originCol = headers.indexOf("ESTAÇÃO ORIGEM");
  const destCol = headers.indexOf("ESTAÇÃO DESTINO");

  /**
   * One alias per STATION, not per cell. A milk run written inside one row stacks both stations in
   * the same cell with Alt+Enter ("SOC-RJ2 | …\nHUB-LMG-50 | …"), and the parser splits that row
   * into one movement per line — so the value that reaches the resolver is a single line. Teaching
   * the blob as one alias taught nothing: the second station of every stacked row stayed unknown
   * (6 rows of the first real file failed on stations that were registered all along).
   */
  const fileValues = new Set<string>();
  for (let r = SHEET.header + 1; r <= sheet.rowCount; r++) {
    for (const col of [originCol, destCol]) {
      for (const line of cellText(sheet.getRow(r).getCell(col).value).split(/\r?\n/)) {
        const v = line.trim();
        if (v) fileValues.add(v);
      }
    }
  }

  const siteRows = await db
    .select({ id: locations.id, code: locations.code })
    .from(locations)
    .where(eq(locations.customerId, customerId));
  const byCode = new Map(siteRows.map((s) => [s.code.toUpperCase(), s.id]));

  let created = 0;
  let skipped = 0;
  const unresolved: string[] = [];
  for (const fileValue of fileValues) {
    // "SOC-BA2 | SOC_BA_SIMOES FILHO" → the code is everything before the pipe.
    const code = (fileValue.includes("|") ? fileValue.split("|")[0]! : fileValue)
      .trim()
      .toUpperCase();
    const locationId = byCode.get(code);
    if (!locationId) {
      unresolved.push(fileValue);
      continue;
    }
    const already = await db
      .select({ id: locationAliases.id })
      .from(locationAliases)
      .where(
        and(eq(locationAliases.customerId, customerId), eq(locationAliases.fileValue, fileValue)),
      )
      .limit(1);
    if (already[0]) {
      skipped++;
      continue;
    }
    await db
      .insert(locationAliases)
      .values({ customerId, fileValue, locationId, createdBy: actorId });
    created++;
  }

  console.log(
    `apelidos de local: ${created} criados, ${skipped} já existiam (de ${fileValues.size} valores distintos no arquivo)`,
  );
  if (unresolved.length) {
    console.log(
      `\n${unresolved.length} valores SEM local correspondente (serão erro na importação):`,
    );
    for (const v of unresolved) console.log(`   ${v}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
