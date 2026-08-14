import "dotenv/config";
import ExcelJS from "exceljs";
import { eq, isNull } from "drizzle-orm";
import { customers, db, drivers, trailers, trips, users, vehicles } from "../src";
import { assignTrip } from "../src/trips/trip-assignments";

/**
 * Apply the resources the customer's own schedule already names: for every LH in the SHOPEE sheet,
 * assign the driver (MOTORISTA), tractor (CAVALO) and semi-trailer (CARRETA) to the matching trip.
 * Run AFTER the trips are imported and `db:seed:shopee` has loaded the fleet:
 *   pnpm --filter @brazil-tms/db db:seed:shopee-assign -- "C:/caminho/PROGRAMAÇÃO 2026.xlsx"
 *
 * It goes through `assignTrip`, the SAME domain function the Dispatch screen calls — never a raw
 * INSERT. That means every bulk assignment runs the real eligibility evaluation and writes the
 * assignment row + `status_change` event + audit in one transaction, exactly like a human dispatch:
 *
 *  - a BLOCK (double-booked driver, archived/inactive resource, expired document) refuses the row and
 *    is reported. Those are conflicts inside the customer's spreadsheet — surfacing them is the point;
 *  - a WARN proceeds carrying a documented override reason naming the source LH, so the audit trail
 *    says WHY it was accepted;
 *  - a trip already out of `received` is skipped (idempotent: re-running never re-assigns).
 *
 * Matching keys: trip = (Shopee, LH); driver = normalized MOTORISTA name — the sheet's CPF column is
 * an unresolved VLOOKUP formula in the xlsx, while the name is real text; vehicle/trailer = plate.
 */

const DEFAULT_PATH = "C:/Users/Victor/Downloads/PROGRAMAÇÃO 2026 _ BRAZIL TRANSPORTS.xlsx";
const CUSTOMER_CODE = "SHOPEE";
const SHEET = { name: "SHOPEE", header: 1 };

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

/** Accent-folded, case- and space-insensitive name key (the sheet types the same driver many ways). */
const nameKey = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
const plateKey = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

interface Tally {
  assigned: number;
  noTrip: number;
  notReceived: number;
  noDriver: number;
  noVehicle: number;
  blocked: number;
  failed: number;
}

async function main(): Promise<void> {
  const path = process.argv[2] ?? DEFAULT_PATH;
  const limit = process.argv[3] ? Number(process.argv[3]) : Infinity;

  const customer = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerCode, CUSTOMER_CODE))
    .limit(1);
  const customerId = customer[0]?.id;
  if (!customerId)
    throw new Error(`Cliente ${CUSTOMER_CODE} não existe — rode db:seed:shopee antes.`);

  const actor = await db.select({ id: users.id }).from(users).limit(1);
  const actorId = actor[0]?.id;
  if (!actorId) throw new Error("Nenhum usuário no banco para registrar a atribuição.");

  // ---- in-memory indexes (one query each; the loop then does no lookups) ---------------------
  const driverRows = await db
    .select({
      id: drivers.id,
      name: drivers.name,
      carrierId: drivers.carrierId,
      ownershipType: drivers.ownershipType,
    })
    .from(drivers)
    .where(isNull(drivers.archivedAt));
  const driverByName = new Map(driverRows.map((d) => [nameKey(d.name), d]));

  const vehicleRows = await db
    .select({ id: vehicles.id, plate: vehicles.plate, carrierId: vehicles.carrierId })
    .from(vehicles)
    .where(isNull(vehicles.archivedAt));
  const vehicleByPlate = new Map(vehicleRows.map((v) => [plateKey(v.plate), v]));

  const trailerRows = await db
    .select({ id: trailers.id, plate: trailers.plate })
    .from(trailers)
    .where(isNull(trailers.archivedAt));
  const trailerByPlate = new Map(trailerRows.map((t) => [plateKey(t.plate), t]));

  const tripRows = await db
    .select({ id: trips.id, externalTripId: trips.externalTripId, status: trips.currentStatus })
    .from(trips)
    .where(eq(trips.customerId, customerId));
  const tripByExternal = new Map(
    tripRows
      .filter((t) => t.externalTripId)
      .map((t) => [t.externalTripId!.trim().toUpperCase(), t]),
  );
  console.log(
    `índices: ${driverByName.size} motoristas, ${vehicleByPlate.size} veículos, ${trailerByPlate.size} reboques, ${tripByExternal.size} viagens`,
  );

  // ---- read the schedule ---------------------------------------------------------------------
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.getWorksheet(SHEET.name);
  if (!sheet) throw new Error(`Aba ${SHEET.name} não encontrada.`);
  const headers: string[] = [];
  sheet.getRow(SHEET.header).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cellText(cell.value).trim();
  });
  const col = (name: string): number => headers.indexOf(name);

  const tally: Tally = {
    assigned: 0,
    noTrip: 0,
    notReceived: 0,
    noDriver: 0,
    noVehicle: 0,
    blocked: 0,
    failed: 0,
  };
  const missingDrivers = new Set<string>();
  const missingVehicles = new Set<string>();
  const blockReasons = new Map<string, number>();
  let processed = 0;

  for (let r = SHEET.header + 1; r <= sheet.rowCount && processed < limit; r++) {
    const row = sheet.getRow(r);
    const lh = cellText(row.getCell(col("LH")).value)
      .trim()
      .toUpperCase();
    const driverName = cellText(row.getCell(col("MOTORISTA")).value).trim();
    const cavalo = cellText(row.getCell(col("CAVALO")).value).trim();
    const carreta = cellText(row.getCell(col("CARRETA")).value).trim();
    if (!lh || !driverName || !cavalo) continue;

    const trip = tripByExternal.get(lh);
    if (!trip) {
      tally.noTrip++;
      continue;
    }
    if (trip.status !== "received") {
      tally.notReceived++;
      continue;
    }
    const driver = driverByName.get(nameKey(driverName));
    if (!driver) {
      tally.noDriver++;
      missingDrivers.add(driverName);
      continue;
    }
    const vehicle = vehicleByPlate.get(plateKey(cavalo));
    if (!vehicle) {
      tally.noVehicle++;
      missingVehicles.add(cavalo);
      continue;
    }
    const trailer = carreta ? trailerByPlate.get(plateKey(carreta)) : undefined;
    // Carrier is required whenever the chosen resources are subcontracted; the driver's own carrier
    // (the "Agregados" umbrella) is the right one — the vehicle's is the fallback.
    const carrierId = driver.carrierId ?? vehicle.carrierId ?? undefined;

    processed++;
    try {
      await assignTrip(
        trip.id,
        {
          // Shared input type with `reassignTrip`; `assignTrip` itself only ever assigns FROM
          // `received` (its in-transaction guard hardcodes it), so this states the same thing.
          expectedFromStatus: "received",
          driverId: driver.id,
          vehicleId: vehicle.id,
          trailerId: trailer?.id,
          carrierId,
          // Documented override: warnings are accepted because the CUSTOMER already committed these
          // resources in its own schedule — the reason names the source row for the audit trail.
          overrideReason: `Atribuição importada da programação Shopee (LH ${lh}).`,
        },
        actorId,
      );
      tally.assigned++;
    } catch (error) {
      const code = (error as { code?: string }).code ?? "ERRO";
      if (code === "ASSIGNMENT_BLOCKED" || code === "INCOMPLETE_ASSIGNMENT") {
        tally.blocked++;
        const findings = (error as { details?: { code?: string }[] }).details ?? [];
        for (const f of findings.length ? findings : [{ code }]) {
          const key = f.code ?? code;
          blockReasons.set(key, (blockReasons.get(key) ?? 0) + 1);
        }
      } else {
        tally.failed++;
        blockReasons.set(code, (blockReasons.get(code) ?? 0) + 1);
      }
    }

    if (processed % 200 === 0) {
      console.log(`  ... ${processed} linhas processadas (${tally.assigned} atribuídas)`);
    }
  }

  console.log("\n=== resultado ===");
  console.log(`atribuídas:            ${tally.assigned}`);
  console.log(`bloqueadas (regras):   ${tally.blocked}`);
  console.log(`erro inesperado:       ${tally.failed}`);
  console.log(`viagem não importada:  ${tally.noTrip}`);
  console.log(`viagem já não estava "Recebida": ${tally.notReceived}`);
  console.log(`motorista não cadastrado: ${tally.noDriver} (${missingDrivers.size} nomes)`);
  console.log(`veículo não cadastrado:   ${tally.noVehicle} (${missingVehicles.size} placas)`);
  if (blockReasons.size) {
    console.log("\nmotivos de bloqueio:");
    for (const [code, n] of [...blockReasons.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${String(n).padStart(5)}x  ${code}`);
    }
  }
  if (missingDrivers.size) {
    console.log(
      `\nmotoristas sem cadastro (até 10): ${[...missingDrivers].slice(0, 10).join(" ; ")}`,
    );
  }
  if (missingVehicles.size) {
    console.log(`placas sem cadastro (até 10): ${[...missingVehicles].slice(0, 10).join(" ; ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
