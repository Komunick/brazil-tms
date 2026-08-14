import "dotenv/config";
import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { customers, db, importTemplates, locationAliases, locations, users } from "../src";

/**
 * The Shopee trip-import template + the location aliases its file values need (feature 004; R8,
 * Constitution V — config, never per-customer code). Run AFTER `db:seed:shopee` (which loads the
 * customer, the sites and the fleet):
 *   pnpm --filter @brazil-tms/db db:seed:shopee-template -- "C:/caminho/PROGRAMAÇÃO 2026.xlsx"
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
 * Status is deliberately NOT mapped (business call 2026-08-14): the customer's STATUS / STATUS
 * VIAGEM / DOCA columns are ignored, so every imported trip is born `received` and the TMS status
 * machine owns the lifecycle from there. No `status_mappings` rows are needed.
 */

const DEFAULT_PATH = "C:/Users/Victor/Downloads/PROGRAMAÇÃO 2026 _ BRAZIL TRANSPORTS.xlsx";
const CUSTOMER_CODE = "SHOPEE";
const TEMPLATE_NAME = "Programação Shopee";
const SHEET = { name: "SHOPEE", header: 1 };

/**
 * The columns we consume. Everything else in the file (STATUS, STATUS VIAGEM, DOCA, CTE, CHECKLIST,
 * SM RASTER, MOTORISTA/CPF/CAVALO/CARRETA…) is intentionally absent: the engine's targets are the
 * trip PLAN, and resource assignment is a separate slice.
 */
const COLUMN_MAPPINGS = [
  { source: "LH", target: "externalTripId", required: true },
  { source: "ESTAÇÃO ORIGEM", target: "originCode", required: true },
  { source: "ESTAÇÃO DESTINO", target: "destinationCode", required: true },
  { source: "ETA ORIGEM", target: "plannedPickupWindowStart" },
  { source: "CPT ORIGEM", target: "plannedPickupWindowEnd" },
  { source: "ETA DESTINO", target: "plannedDeliveryWindowStart" },
  { source: "PERFIL", target: "plannedVehicleType" },
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

  const fileValues = new Set<string>();
  for (let r = SHEET.header + 1; r <= sheet.rowCount; r++) {
    for (const col of [originCol, destCol]) {
      const v = cellText(sheet.getRow(r).getCell(col).value).trim();
      if (v) fileValues.add(v);
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
