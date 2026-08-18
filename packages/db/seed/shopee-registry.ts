import "dotenv/config";
import ExcelJS from "exceljs";
import { and, eq, isNull } from "drizzle-orm";
import { carriers, customers, db, drivers, locations, trailers, vehicles } from "../src";

/**
 * One-off registry load from the customer's own planning workbook (Shopee "PROGRAMAÇÃO 2026").
 * Populates the master data the trip import depends on, straight from the sheets the customer
 * already maintains:
 *
 *   ENDEREÇOS SHOPEE  → locations (customer-scoped sites, with address/UF)
 *   MOTORISTAS        → drivers   (name, CPF, phone, CNH expiry, owned/subcontracted)
 *   VEÍCULOSCARRETAS  → vehicles  (CAVALO/TRUCK/TOCO/VUC) + trailers (CARRETA, CARRETA 2)
 *
 * Run (path defaults to the value below; pass another as argv[2]):
 *   pnpm --filter @brazil-tms/db db:seed:shopee "C:/caminho/PROGRAMAÇÃO 2026.xlsx"
 *
 * IDEMPOTENT: every entity is keyed on its natural key (location = customer+code, driver = CPF or
 * name, vehicle/trailer = plate) and updated in place on re-run, so re-loading a corrected workbook
 * fixes rows instead of duplicating them.
 *
 * DOCUMENTED DECISIONS (agreed with the business 2026-08-14; Constitution II — labeled, not invented):
 *  - `FROTA` → owned; `AGREGADO` → subcontracted, all under ONE carrier named "Agregados" (the
 *    workbook carries no real carrier per driver). Reclassify later with an UPDATE, no re-load.
 *  - Vehicles/trailers follow the same rule; a plate is `owned` ONLY when every driver who ran it in
 *    the SHOPEE sheet is FROTA (25 plates), otherwise it belongs to "Agregados".
 *  - Duplicate drivers (same CPF, or same name) collapse to ONE record — first occurrence wins.
 *  - An invalid CPF is loaded AS-IS (business call): the driver exists in the TMS, and the form's
 *    check-digit validation forces the fix the first time someone edits them.
 *  - "CARRETA - EX"/"TRUCK - EX" are the same vehicle as CARRETA/TRUCK — the suffix is dropped.
 *  - Trailer type is not in the workbook; every trailer loads as `bau` (the linehaul default).
 */

const DEFAULT_PATH = "C:/Users/Victor/Downloads/PROGRAMAÇÃO 2026 _ BRAZIL TRANSPORTS.xlsx";
const CUSTOMER_NAME = "Shopee";
const CUSTOMER_CODE = "SHOPEE";
const AGGREGATE_CARRIER = "Agregados";

/** Header row per sheet — these are NOT row 1 in the registry sheets. */
const SHEETS = {
  trips: { name: "SHOPEE", header: 1 },
  drivers: { name: "MOTORISTAS", header: 3 },
  vehicles: { name: "VEÍCULOSCARRETAS", header: 4 },
  stations: { name: "ENDEREÇOS SHOPEE", header: 1 },
} as const;

type Row = Record<string, string>;

/** Cell → string, mirroring the import worker's `cellToString` (formula cells may carry no value). */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) {
      return (value as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    }
    if ("result" in value) {
      const result = (value as ExcelJS.CellFormulaValue).result;
      return result === null || result === undefined ? "" : String(result);
    }
    if ("formula" in value) return "";
    if ("text" in value) return String((value as ExcelJS.CellHyperlinkValue).text);
    return "";
  }
  return String(value);
}

function readSheet(workbook: ExcelJS.Workbook, sheetName: string, headerRow: number): Row[] {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) throw new Error(`Aba "${sheetName}" não encontrada na planilha.`);

  const headers: string[] = [];
  sheet.getRow(headerRow).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cellText(cell.value).trim();
  });

  const rows: Row[] = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const record: Row = {};
    let hasValue = false;
    for (let c = 1; c < headers.length; c++) {
      const header = headers[c];
      if (!header) continue;
      const text = cellText(row.getCell(c).value).trim();
      record[header] = text;
      if (text !== "") hasValue = true;
    }
    if (hasValue) rows.push(record);
  }
  return rows;
}

const norm = (s: string | undefined): string => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
const digitsOf = (s: string | undefined): string => (s ?? "").replace(/\D/g, "");
const plateOf = (s: string | undefined): string =>
  (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isPlate = (p: string): boolean => /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/.test(p);

/**
 * UF from the station NAME, not from the workbook's `UF` column — that column is unreliable
 * (SOC-BA2 "SOC_BA_Simões Filho" is tagged SP; HUB-LRN-02 "Mossoró" is tagged ES). Shopee's naming
 * embeds the state between underscores: `SOC_BA_SIMOES FILHO`, `LM HUB_RN_NATAL_01`.
 */
const UF_VALUES = new Set([
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
]);
function ufFromName(name: string): string | null {
  for (const part of norm(name).split(/[_\s|]+/)) {
    if (UF_VALUES.has(part)) return part;
  }
  return null;
}

/** An ISO date string (from a native Excel date) → `YYYY-MM-DD`, or null. */
function isoDate(value: string): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (match) return match[1]!;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
  if (br) return `${br[3]}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}`;
  return null;
}

/** `FROTA` → owned, `AGREGADO`/typos → subcontracted; anything else → null (unknown). */
function ownershipOf(raw: string | undefined): "owned" | "subcontracted" | null {
  const v = norm(raw);
  if (v.startsWith("FROTA")) return "owned";
  if (v.startsWith("AGRE") || v.startsWith("AGRA")) return "subcontracted";
  return null;
}

/** Workbook vehicle label → the closed `vehicle_type` enum. "- EX" is a commercial marker, not a type. */
function vehicleTypeOf(
  raw: string | undefined,
): "vuc" | "tres_quartos" | "toco" | "truck" | "carreta" {
  const v = norm(raw)
    .replace(/\s*-\s*EX$/, "")
    .replace(/-EX$/, "");
  if (v.startsWith("CARRET") || v === "CAVALO") return "carreta"; // CAVALO pulls a semi-trailer
  if (v.startsWith("TRUCK") || v.startsWith("TRUK")) return "truck";
  if (v.startsWith("TOCO")) return "toco";
  if (v.startsWith("3/4") || v.startsWith("TRES")) return "tres_quartos";
  if (v.startsWith("VUC")) return "vuc";
  return "carreta";
}

async function main(): Promise<void> {
  const path = process.argv[2] ?? DEFAULT_PATH;
  console.log(`Lendo ${path}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);

  // ---- customer + aggregate carrier ---------------------------------------------------------
  const existingCustomer = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerCode, CUSTOMER_CODE))
    .limit(1);
  const customerId =
    existingCustomer[0]?.id ??
    (
      await db
        .insert(customers)
        .values({ name: CUSTOMER_NAME, customerCode: CUSTOMER_CODE })
        .returning({ id: customers.id })
    )[0]!.id;
  console.log(`cliente ${CUSTOMER_NAME}: ${customerId}`);

  const existingCarrier = await db
    .select({ id: carriers.id })
    .from(carriers)
    .where(eq(carriers.name, AGGREGATE_CARRIER))
    .limit(1);
  const carrierId =
    existingCarrier[0]?.id ??
    (
      await db
        .insert(carriers)
        // Umbrella carrier for the aggregated fleet — the workbook names no real carrier per driver.
        .values({ name: AGGREGATE_CARRIER, legalName: "Agregados (planilha Shopee)" })
        .returning({ id: carriers.id })
    )[0]!.id;
  console.log(`transportadora ${AGGREGATE_CARRIER}: ${carrierId}`);

  // ---- locations (ENDEREÇOS SHOPEE) ---------------------------------------------------------
  const stationRows = readSheet(workbook, SHEETS.stations.name, SHEETS.stations.header);
  let locInserted = 0;
  let locUpdated = 0;
  const seenCodes = new Set<string>();
  for (const row of stationRows) {
    const code = (row["New Sort Code"] ?? "").trim();
    const name = (row["Station Name"] ?? "").trim() || code;
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);

    const values = {
      customerId,
      code,
      name,
      address: (row["Address"] ?? "").trim() || null,
      state: ufFromName(name),
      // Every site loads ACTIVE. The workbook's `Status` column is Shopee's own lifecycle and is
      // stale: sites reading "Not started"/blank (SOC-RJ2, SOC-SP8, HUB-LBA-17…) carry hundreds of
      // trips in the same file. Archiving on it made the import reject 841 rows as UNKNOWN_LOCATION.
      archivedAt: null,
    };

    const existing = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.customerId, customerId), eq(locations.code, code)))
      .limit(1);
    if (existing[0]) {
      await db
        .update(locations)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(locations.id, existing[0].id));
      locUpdated++;
    } else {
      await db.insert(locations).values(values);
      locInserted++;
    }
  }
  console.log(
    `locais: ${locInserted} criados, ${locUpdated} atualizados (de ${stationRows.length} linhas)`,
  );

  // ---- stations referenced ONLY by the trip sheet --------------------------------------------
  // The address sheet is incomplete: 51 of the 80 station codes the schedule actually uses are
  // absent from it (every XPT site, among others). A trip cannot import without its origin and
  // destination, so any station named by the schedule is created from the file value itself
  // ("SOC-PE2 | SOC_PE_JABOATÃO DOS GUARARAPES" → code SOC-PE2, name SOC_PE_JABOATÃO…).
  const scheduleRows = readSheet(workbook, SHEETS.trips.name, SHEETS.trips.header);
  const fromSchedule = new Map<string, string>();
  for (const row of scheduleRows) {
    for (const key of ["ESTAÇÃO ORIGEM", "ESTAÇÃO DESTINO"]) {
      const value = (row[key] ?? "").trim();
      if (!value || !value.includes("|")) continue; // malformed values stay for a human to map
      const code = value.split("|")[0]!.trim();
      const name = value.split("|").slice(1).join("|").trim();
      if (code && !fromSchedule.has(code)) fromSchedule.set(code, name || code);
    }
  }
  let extraSites = 0;
  for (const [code, name] of fromSchedule) {
    if (seenCodes.has(code)) continue;
    const existing = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.customerId, customerId), eq(locations.code, code)))
      .limit(1);
    if (existing[0]) continue;
    await db.insert(locations).values({ customerId, code, name, state: ufFromName(name) });
    seenCodes.add(code);
    extraSites++;
  }
  console.log(`locais extras vindos da programação (ausentes na aba de endereços): ${extraSites}`);

  // ---- drivers (MOTORISTAS) -----------------------------------------------------------------
  const driverRows = readSheet(workbook, SHEETS.drivers.name, SHEETS.drivers.header);
  const byCpf = new Map<string, Row>();
  const byName = new Map<string, Row>();
  const invalidCpf: string[] = [];
  for (const row of driverRows) {
    const name = (row["MOTORISTA"] ?? "").trim();
    if (!name) continue;
    const cpf = digitsOf(row["CPF"]);
    // First occurrence wins (business call): a repeated CPF/name is the same person re-typed.
    if (cpf) {
      if (byCpf.has(cpf)) continue;
      byCpf.set(cpf, row);
    } else if (byName.has(norm(name))) {
      continue;
    }
    if (!byName.has(norm(name))) byName.set(norm(name), row);
  }
  const uniqueDrivers = [...new Set([...byCpf.values(), ...byName.values()])];

  let drvInserted = 0;
  let drvUpdated = 0;
  for (const row of uniqueDrivers) {
    const name = (row["MOTORISTA"] ?? "").trim();
    const cpf = digitsOf(row["CPF"]) || null;
    if (cpf && cpf.length !== 11) invalidCpf.push(`${name} (${row["CPF"]})`);
    const ownership = ownershipOf(row["FROTA / AGREGADO"]) ?? "subcontracted";
    const phone = digitsOf(row["TELEFONE"]);

    const values = {
      name,
      cpf,
      phone: phone.length === 10 || phone.length === 11 ? phone : null,
      licenseExpiry: isoDate(row["VENCIMENTO CNH"] ?? ""),
      ownershipType: ownership,
      carrierId: ownership === "subcontracted" ? carrierId : null,
      status: "active" as const,
    };

    const existing = cpf
      ? await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.cpf, cpf)).limit(1)
      : await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.name, name)).limit(1);

    if (existing[0]) {
      await db
        .update(drivers)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(drivers.id, existing[0].id));
      drvUpdated++;
    } else {
      await db.insert(drivers).values(values);
      drvInserted++;
    }
  }
  console.log(
    `motoristas: ${drvInserted} criados, ${drvUpdated} atualizados (${driverRows.length} linhas → ${uniqueDrivers.length} únicos; ${invalidCpf.length} com CPF fora do padrão, carregados como estão)`,
  );

  // ---- vehicle ownership inference (SHOPEE sheet) -------------------------------------------
  const tripRows = scheduleRows;
  const driverKind = new Map<string, "owned" | "subcontracted">();
  for (const row of driverRows) {
    const kind = ownershipOf(row["FROTA / AGREGADO"]);
    const name = norm(row["MOTORISTA"]);
    if (name && kind) driverKind.set(name, kind);
  }
  const plateKinds = new Map<string, Set<"owned" | "subcontracted">>();
  for (const row of tripRows) {
    const plate = plateOf(row["CAVALO"]);
    const kind = driverKind.get(norm(row["MOTORISTA"]));
    if (!plate || !kind) continue;
    const set = plateKinds.get(plate) ?? new Set();
    set.add(kind);
    plateKinds.set(plate, set);
  }
  /** Owned ONLY when every driver seen on that plate is FROTA; unknown/mixed → aggregate carrier. */
  const ownershipForPlate = (plate: string): "owned" | "subcontracted" => {
    const kinds = plateKinds.get(plate);
    return kinds && kinds.size === 1 && kinds.has("owned") ? "owned" : "subcontracted";
  };

  // ---- vehicles + trailers (VEÍCULOSCARRETAS) -----------------------------------------------
  const fleetRows = readSheet(workbook, SHEETS.vehicles.name, SHEETS.vehicles.header);
  const vehicleSeen = new Map<string, Row>();
  const trailerPlates = new Set<string>();
  for (const row of fleetRows) {
    const plate = plateOf(row["PLACA"]);
    if (plate && isPlate(plate) && !vehicleSeen.has(plate)) vehicleSeen.set(plate, row);
    for (const key of ["CARRETA", "CARRETA 2"]) {
      const t = plateOf(row[key]);
      if (t && isPlate(t)) trailerPlates.add(t);
    }
  }
  // A plate can only be one thing: if it shows up as a tractor, it is not loaded as a trailer.
  for (const plate of vehicleSeen.keys()) trailerPlates.delete(plate);

  let vehInserted = 0;
  let vehUpdated = 0;
  for (const [plate, row] of vehicleSeen) {
    const ownership = ownershipForPlate(plate);
    const tracker = (row["TECNOLOGIA"] ?? "").trim();
    const values = {
      plate,
      vehicleType: vehicleTypeOf(row["TIIPO"] ?? row["TIPO"]),
      ownershipType: ownership,
      carrierId: ownership === "subcontracted" ? carrierId : null,
      trackerProvider: tracker || null,
      status: "active" as const,
    };
    const existing = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.plate, plate))
      .limit(1);
    if (existing[0]) {
      await db
        .update(vehicles)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(vehicles.id, existing[0].id));
      vehUpdated++;
    } else {
      await db.insert(vehicles).values(values);
      vehInserted++;
    }
  }
  console.log(
    `veículos: ${vehInserted} criados, ${vehUpdated} atualizados (${vehicleSeen.size} placas únicas)`,
  );

  let trlInserted = 0;
  let trlUpdated = 0;
  for (const plate of trailerPlates) {
    const ownership = ownershipForPlate(plate);
    const values = {
      plate,
      trailerType: "bau" as const,
      ownershipType: ownership,
      carrierId: ownership === "subcontracted" ? carrierId : null,
      status: "active" as const,
    };
    const existing = await db
      .select({ id: trailers.id })
      .from(trailers)
      .where(eq(trailers.plate, plate))
      .limit(1);
    if (existing[0]) {
      await db
        .update(trailers)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(trailers.id, existing[0].id));
      trlUpdated++;
    } else {
      await db.insert(trailers).values(values);
      trlInserted++;
    }
  }
  console.log(
    `reboques: ${trlInserted} criados, ${trlUpdated} atualizados (${trailerPlates.size} placas únicas)`,
  );

  const activeLocations = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.customerId, customerId), isNull(locations.archivedAt)));
  console.log(`\nresumo: ${activeLocations.length} locais ativos para ${CUSTOMER_NAME}`);
  if (invalidCpf.length) {
    console.log(`CPFs fora do padrão (carregados como estão): ${invalidCpf.length}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
