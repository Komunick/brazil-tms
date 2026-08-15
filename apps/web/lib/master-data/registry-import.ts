import "server-only";
import ExcelJS from "exceljs";
import { eq, inArray, isNull } from "drizzle-orm";
import { carriers, db, drivers, trailers, vehicles } from "@brazil-tms/db";

/**
 * Registry import (Motoristas / Veículos / Reboques) from the customer's own planning workbook.
 *
 * Reads two sheets and lands them on the three fleet registries — the mapping the business signed
 * off (2026-08-15):
 *
 *   MOTORISTAS         MOTORISTA → nome · CPF → CPF · TELEFONE → telefone · VENCIMENTO CNH → validade
 *   VEÍCULOSCARRETAS   PLACA → placa · TIPO → tipo (CAVALO is its own type) · TECNOLOGIA → rastreador
 *   VEÍCULOSCARRETAS   CARRETA and CARRETA 2 → reboques (both columns are plates)
 *
 * Design decisions worth knowing:
 *
 *  - SHEETS AND HEADERS ARE FOUND, NOT HARDCODED. The workbook's registry sheets do not start on
 *    row 1 (they start on 3 and 4), the header has a typo ("TIIPO"), and the file is re-exported by
 *    hand every week. So we locate the sheet by name and the header by its labels, accent- and
 *    case-insensitively, and fall back to the documented column letters (A/B/C, E/F).
 *  - IDEMPOTENT: re-uploading a corrected workbook updates in place — drivers by CPF+name, vehicles
 *    and trailers by plate. Nothing is ever duplicated by re-running.
 *  - DUPLICATE CPF IS ALLOWED, NOT SILENT (business call): the same CPF under two different names is
 *    loaded as two people AND reported as a warning, because it is usually a typo — and because it
 *    breaks CPF as an identifier, the matching key is CPF **plus** name.
 *  - AN INVALID CPF IS LOADED AS-IS and reported: the driver exists, the number needs fixing.
 *  - Nothing here archives or deletes: a driver missing from this week's file is left untouched.
 */

export type RegistryEntity = "drivers" | "vehicles" | "trailers";

export interface RegistryWarning {
  entity: RegistryEntity;
  /** Machine-readable reason; the UI renders its own pt-BR sentence per code. */
  code:
    | "cpf_invalido"
    | "cpf_compartilhado"
    | "nome_divergente"
    | "telefone_invalido"
    | "placa_invalida"
    | "linha_incompleta"
    | "tipo_desconhecido";
  /** Row number in the source sheet (1-based, as the user sees it in Excel). */
  row: number;
  detail: string;
}

export interface RegistryImportResult {
  drivers: { created: number; updated: number; unchanged: number };
  vehicles: { created: number; updated: number; unchanged: number };
  trailers: { created: number; updated: number; unchanged: number };
  warnings: RegistryWarning[];
  /** Sheets we could not find — the UI tells the user which part of the file was skipped. */
  missingSheets: string[];
}

// ---------------------------------------------------------------------------
// Cell / text helpers
// ---------------------------------------------------------------------------

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
    // A formula whose cached value was not saved (Excel/Sheets exports do this) reads as empty.
    if ("formula" in value) return "";
    if ("text" in value) return String((value as ExcelJS.CellHyperlinkValue).text);
    return "";
  }
  return String(value);
}

/** Accent-folded upper-case key used to compare header labels and person names. */
const fold = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim().replace(/\s+/g, " ");

const digitsOf = (s: string): string => s.replace(/\D/g, "");

/**
 * Are these two names plausibly the SAME person typed twice?
 *
 * The workbook is hand-typed, so one CPF very often carries two spellings of one person
 * ("ARTUR BORGES SANTANA NETO" / "ARTUR BORGES SANT ANA NETO", "OLIVEIRA" / "OLIVERIA") — and much
 * more rarely two genuinely different people sharing a mistyped CPF. Treating every repeat as a new
 * person would litter the registry with near-duplicates; treating every repeat as the same person
 * would merge two real drivers. So: same first name AND at least half the remaining words in common.
 */
function sameishPerson(a: string, b: string): boolean {
  const wordsOf = (s: string): string[] =>
    fold(s)
      .split(" ")
      .filter((w) => w.length > 1);
  const [x, y] = [wordsOf(a), wordsOf(b)];
  if (!x.length || !y.length) return false;
  // The first name may itself be mistyped ("DASSAIVEL" / "DASSAIEVEL"), so allow edits in proportion
  // to its length: a long name absorbs two, a short one none — "ANA" and "ANO" are different people.
  const budget = Math.floor(Math.min(x[0]!.length, y[0]!.length) / 4);
  if (editDistance(x[0]!, y[0]!) > budget) return false;
  const shared = x.filter((w) => y.includes(w)).length;
  return shared >= Math.ceil(Math.min(x.length, y.length) / 2);
}

/** Levenshtein distance, capped: we only ever ask "is this within 1–2 edits?". */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length]!;
}
const plateOf = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const isPlate = (p: string): boolean => /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/.test(p);

/** CPF check digits (Receita Federal mod-11); repdigits are never issued. */
function isValidCpf(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (upTo: number): number => {
    let sum = 0;
    for (let i = 0; i < upTo; i += 1) sum += Number(d[i]) * (upTo + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

/** ISO (native Excel date) or dd/MM/yyyy → `YYYY-MM-DD`; anything else → null. */
function toIsoDate(value: string): string | null {
  if (!value) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (iso) return iso[1]!;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
  if (br) return `${br[3]}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}`;
  return null;
}

/** Workbook vehicle label → `vehicle_type`. CAVALO is its own type since 0013. */
function toVehicleType(raw: string): string | null {
  const v = fold(raw).replace(/\s*-\s*EX$/, "");
  if (v.startsWith("CAVALO")) return "cavalo";
  if (v.startsWith("CARRET")) return "carreta";
  if (v.startsWith("TRUCK") || v.startsWith("TRUK")) return "truck";
  if (v.startsWith("TOCO")) return "toco";
  if (v.startsWith("BITRUCK")) return "bitruck";
  if (v.startsWith("BITREM")) return "bitrem";
  if (v.startsWith("RODOTREM")) return "rodotrem";
  if (v.startsWith("3/4") || v.startsWith("TRES")) return "tres_quartos";
  if (v.startsWith("VUC")) return "vuc";
  if (v.startsWith("VAN")) return "van";
  return null;
}

/** `FROTA` → owned; `AGREGADO` (and its typos) → subcontracted; unknown → null. */
function toOwnership(raw: string): "owned" | "subcontracted" | null {
  const v = fold(raw);
  if (v.startsWith("FROTA")) return "owned";
  if (v.startsWith("AGRE") || v.startsWith("AGRA")) return "subcontracted";
  return null;
}

// ---------------------------------------------------------------------------
// Sheet / header location
// ---------------------------------------------------------------------------

/** The sheet whose name contains `needle` (accent/case-insensitive), or null. */
function findSheet(workbook: ExcelJS.Workbook, needle: string): ExcelJS.Worksheet | null {
  const key = fold(needle).replace(/[^A-Z]/g, "");
  for (const sheet of workbook.worksheets) {
    if (
      fold(sheet.name)
        .replace(/[^A-Z]/g, "")
        .includes(key)
    )
      return sheet;
  }
  return null;
}

/**
 * The first row (within the first 15) that looks like the header: it must carry `required`. Returns
 * the row number and a label→column index map. The registry sheets start below row 1, and the export
 * is hand-made, so scanning beats hardcoding.
 */
function findHeader(
  sheet: ExcelJS.Worksheet,
  required: string[],
): { row: number; columns: Map<string, number> } | null {
  const wanted = required.map(fold);
  for (let r = 1; r <= Math.min(sheet.rowCount, 15); r++) {
    const columns = new Map<string, number>();
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const label = fold(cellText(cell.value));
      if (label) columns.set(label, col);
    });
    if (wanted.every((w) => columns.has(w))) return { row: r, columns };
  }
  return null;
}

/** Column index by any of its accepted labels, falling back to a documented letter (1-based). */
function columnIndex(columns: Map<string, number>, labels: string[], fallback?: number): number {
  for (const label of labels) {
    const found = columns.get(fold(label));
    if (found) return found;
  }
  return fallback ?? -1;
}

// ---------------------------------------------------------------------------
// Parsed shapes
// ---------------------------------------------------------------------------

interface ParsedDriver {
  row: number;
  name: string;
  cpf: string | null;
  phone: string | null;
  licenseExpiry: string | null;
  ownership: "owned" | "subcontracted";
}
interface ParsedVehicle {
  row: number;
  plate: string;
  vehicleType: string;
  tracker: string | null;
}
interface ParsedTrailer {
  row: number;
  plate: string;
}

export interface ParsedRegistry {
  drivers: ParsedDriver[];
  vehicles: ParsedVehicle[];
  trailers: ParsedTrailer[];
  warnings: RegistryWarning[];
  missingSheets: string[];
}

/** Read the workbook into normalized records + the warnings a human needs to see. */
export async function parseRegistryWorkbook(bytes: Buffer): Promise<ParsedRegistry> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);

  const warnings: RegistryWarning[] = [];
  const missingSheets: string[] = [];
  const parsedDrivers: ParsedDriver[] = [];
  const parsedVehicles: ParsedVehicle[] = [];
  const parsedTrailers: ParsedTrailer[] = [];

  // ---- MOTORISTAS --------------------------------------------------------------------------
  const driverSheet = findSheet(workbook, "MOTORISTAS");
  const driverHeader = driverSheet ? findHeader(driverSheet, ["MOTORISTA"]) : null;
  if (!driverSheet || !driverHeader) {
    missingSheets.push("MOTORISTAS");
  } else {
    const cName = columnIndex(driverHeader.columns, ["MOTORISTA", "NOME"]);
    const cCpf = columnIndex(driverHeader.columns, ["CPF"]);
    const cPhone = columnIndex(driverHeader.columns, ["TELEFONE", "CELULAR"]);
    const cExpiry = columnIndex(driverHeader.columns, ["VENCIMENTO CNH", "VALIDADE CNH", "CNH"]);
    const cOwnership = columnIndex(driverHeader.columns, [
      "FROTA / AGREGADO",
      "FROTA/AGREGADO",
      "TIPO",
    ]);

    const seenName = new Map<string, number>();
    for (let r = driverHeader.row + 1; r <= driverSheet.rowCount; r++) {
      const row = driverSheet.getRow(r);
      const name = cellText(row.getCell(cName).value).trim();
      if (!name) continue;

      const cpfRaw = cCpf > 0 ? cellText(row.getCell(cCpf).value).trim() : "";
      const cpf = digitsOf(cpfRaw) || null;
      if (cpf && !isValidCpf(cpf)) {
        warnings.push({
          entity: "drivers",
          code: "cpf_invalido",
          row: r,
          detail: `${name}: CPF "${cpfRaw}" não é válido — cadastrado assim mesmo, corrija na origem.`,
        });
      }

      const phoneRaw = cPhone > 0 ? cellText(row.getCell(cPhone).value).trim() : "";
      const phoneDigits = digitsOf(phoneRaw);
      let phone: string | null = null;
      if (phoneDigits.length === 10 || phoneDigits.length === 11) phone = phoneDigits;
      else if (phoneDigits.length > 0) {
        warnings.push({
          entity: "drivers",
          code: "telefone_invalido",
          row: r,
          detail: `${name}: telefone "${phoneRaw}" fora do padrão (10 ou 11 dígitos) — gravado em branco.`,
        });
      }

      // Same name twice in one file is a duplicate row, not two people.
      const nameKey = fold(name);
      const previous = seenName.get(nameKey);
      if (previous !== undefined) {
        warnings.push({
          entity: "drivers",
          code: "linha_incompleta",
          row: r,
          detail: `${name}: repetido (linha ${previous}) — a última ocorrência prevalece.`,
        });
      }
      seenName.set(nameKey, r);

      parsedDrivers.push({
        row: r,
        name,
        cpf,
        phone,
        licenseExpiry: cExpiry > 0 ? toIsoDate(cellText(row.getCell(cExpiry).value).trim()) : null,
        ownership:
          (cOwnership > 0 ? toOwnership(cellText(row.getCell(cOwnership).value)) : null) ??
          "subcontracted",
      });
    }

    // The same CPF under two different names: load both, but say so — it is usually a typo, and it
    // means CPF alone no longer identifies a driver.
    const byCpf = new Map<string, ParsedDriver[]>();
    for (const d of parsedDrivers) {
      if (!d.cpf) continue;
      byCpf.set(d.cpf, [...(byCpf.get(d.cpf) ?? []), d]);
    }
    for (const [cpf, list] of byCpf) {
      const distinct = [...new Map(list.map((d) => [fold(d.name), d])).values()];
      if (distinct.length < 2) continue;
      const differentPeople = distinct.some(
        (d, i) => i > 0 && !sameishPerson(distinct[0]!.name, d.name),
      );
      warnings.push({
        entity: "drivers",
        code: differentPeople ? "cpf_compartilhado" : "nome_divergente",
        row: distinct[0]!.row,
        detail: differentPeople
          ? `CPF ${cpf} aparece com pessoas diferentes: ${distinct
              .map((d) => `${d.name} (linha ${d.row})`)
              .join(" e ")} — ambas cadastradas, corrija o CPF na origem.`
          : `CPF ${cpf} aparece com grafias diferentes do mesmo nome: ${distinct
              .map((d) => `${d.name} (linha ${d.row})`)
              .join(" e ")} — um cadastro só, com a última grafia.`,
      });
    }
  }

  // ---- VEÍCULOSCARRETAS --------------------------------------------------------------------
  const fleetSheet = findSheet(workbook, "VEICULOSCARRETAS");
  const fleetHeader = fleetSheet ? findHeader(fleetSheet, ["PLACA"]) : null;
  if (!fleetSheet || !fleetHeader) {
    missingSheets.push("VEÍCULOSCARRETAS");
  } else {
    // Documented positions (A/B/C and E/F) back up the label lookup — the header carries a typo.
    const cPlate = columnIndex(fleetHeader.columns, ["PLACA"], 1);
    const cType = columnIndex(fleetHeader.columns, ["TIPO", "TIIPO"], 2);
    const cTracker = columnIndex(fleetHeader.columns, ["TECNOLOGIA", "RASTREADOR"], 3);
    const cTrailer = columnIndex(fleetHeader.columns, ["CARRETA"], 5);
    const cTrailer2 = columnIndex(fleetHeader.columns, ["CARRETA 2"], 6);

    const seenVehicle = new Set<string>();
    const seenTrailer = new Set<string>();
    for (let r = fleetHeader.row + 1; r <= fleetSheet.rowCount; r++) {
      const row = fleetSheet.getRow(r);

      const plateRaw = cellText(row.getCell(cPlate).value).trim();
      const plate = plateOf(plateRaw);
      if (plate) {
        if (!isPlate(plate)) {
          warnings.push({
            entity: "vehicles",
            code: "placa_invalida",
            row: r,
            detail: `Placa "${plateRaw}" fora do padrão BR/Mercosul — linha ignorada.`,
          });
        } else if (!seenVehicle.has(plate)) {
          seenVehicle.add(plate);
          const typeRaw = cType > 0 ? cellText(row.getCell(cType).value).trim() : "";
          const vehicleType = toVehicleType(typeRaw);
          if (!vehicleType && typeRaw) {
            warnings.push({
              entity: "vehicles",
              code: "tipo_desconhecido",
              row: r,
              detail: `${plate}: tipo "${typeRaw}" não reconhecido — cadastrado como Cavalo.`,
            });
          }
          const tracker = cTracker > 0 ? cellText(row.getCell(cTracker).value).trim() : "";
          parsedVehicles.push({
            row: r,
            plate,
            // The sheet is a tractor list; an unlabelled row is a cavalo.
            vehicleType: vehicleType ?? "cavalo",
            tracker: tracker || null,
          });
        }
      }

      for (const col of [cTrailer, cTrailer2]) {
        if (col <= 0) continue;
        const raw = cellText(row.getCell(col).value).trim();
        if (!raw) continue;
        const trailerPlate = plateOf(raw);
        if (!isPlate(trailerPlate)) {
          warnings.push({
            entity: "trailers",
            code: "placa_invalida",
            row: r,
            detail: `Carreta "${raw}" fora do padrão BR/Mercosul — ignorada.`,
          });
          continue;
        }
        if (!seenTrailer.has(trailerPlate)) {
          seenTrailer.add(trailerPlate);
          parsedTrailers.push({ row: r, plate: trailerPlate });
        }
      }
    }

    // A plate cannot be both: if it pulls, it is a vehicle.
    for (const v of parsedVehicles) seenTrailer.delete(v.plate);
    const vehiclePlates = new Set(parsedVehicles.map((v) => v.plate));
    parsedTrailers.splice(
      0,
      parsedTrailers.length,
      ...parsedTrailers.filter((t) => !vehiclePlates.has(t.plate)),
    );
  }

  // Collapse the rows that describe ONE person before writing: the workbook lists the same driver
  // under two spellings, and without this every import would rewrite those names back and forth —
  // 36 pointless updates a week, and a summary that never reads "nothing changed". Last row wins.
  const collapsedDrivers: ParsedDriver[] = [];
  for (const driver of parsedDrivers) {
    const index = collapsedDrivers.findIndex((kept) =>
      driver.cpf && kept.cpf
        ? kept.cpf === driver.cpf && sameishPerson(kept.name, driver.name)
        : fold(kept.name) === fold(driver.name),
    );
    if (index >= 0) collapsedDrivers[index] = driver;
    else collapsedDrivers.push(driver);
  }

  return {
    drivers: collapsedDrivers,
    vehicles: parsedVehicles,
    trailers: parsedTrailers,
    warnings,
    missingSheets,
  };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

const AGGREGATE_CARRIER = "Agregados";

/**
 * Write the parsed registry. One transaction: a failure leaves the registry exactly as it was.
 * Matching — drivers by CPF **and** name (duplicate CPFs are allowed by decision), vehicles and
 * trailers by plate (already unique in the DB).
 */
export async function applyRegistryImport(parsed: ParsedRegistry): Promise<RegistryImportResult> {
  const result: RegistryImportResult = {
    drivers: { created: 0, updated: 0, unchanged: 0 },
    vehicles: { created: 0, updated: 0, unchanged: 0 },
    trailers: { created: 0, updated: 0, unchanged: 0 },
    warnings: parsed.warnings,
    missingSheets: parsed.missingSheets,
  };

  await db.transaction(async (tx) => {
    // Umbrella carrier for the aggregated fleet (created on first use).
    const existingCarrier = await tx
      .select({ id: carriers.id })
      .from(carriers)
      .where(eq(carriers.name, AGGREGATE_CARRIER))
      .limit(1);
    const carrierId =
      existingCarrier[0]?.id ??
      (
        await tx
          .insert(carriers)
          .values({ name: AGGREGATE_CARRIER, legalName: "Agregados (importação de cadastro)" })
          .returning({ id: carriers.id })
      )[0]!.id;

    // ---- drivers ---------------------------------------------------------------------------
    if (parsed.drivers.length) {
      const existing = await tx
        .select({
          id: drivers.id,
          name: drivers.name,
          cpf: drivers.cpf,
          phone: drivers.phone,
          licenseExpiry: drivers.licenseExpiry,
          ownershipType: drivers.ownershipType,
          carrierId: drivers.carrierId,
        })
        .from(drivers)
        .where(isNull(drivers.archivedAt));
      // Index by CPF (many rows may share one) and by name, so a driver already in the TMS —
      // registered by hand on the form, or loaded last week — is matched, never re-created.
      const byCpf = new Map<string, typeof existing>();
      for (const d of existing) {
        if (!d.cpf) continue;
        byCpf.set(d.cpf, [...(byCpf.get(d.cpf) ?? []), d]);
      }
      const byName = new Map(existing.map((d) => [fold(d.name), d]));

      /**
       * Same CPF + a plausibly-same name → the same driver (the spelling gets corrected). Same CPF
       * with a clearly different name → a second driver, because that is two people sharing a
       * mistyped CPF and merging them would put the wrong person on a trip.
       */
      const findExisting = (d: ParsedDriver): (typeof existing)[number] | undefined => {
        if (d.cpf) {
          const candidates = byCpf.get(d.cpf) ?? [];
          const sameish = candidates.find((c) => sameishPerson(c.name, d.name));
          if (sameish) return sameish;
          if (candidates.length) return undefined; // different person on the same CPF
        }
        return byName.get(fold(d.name));
      };

      const toInsert: (typeof drivers.$inferInsert)[] = [];
      for (const d of parsed.drivers) {
        const target = {
          name: d.name,
          cpf: d.cpf,
          phone: d.phone,
          licenseExpiry: d.licenseExpiry,
          ownershipType: d.ownership,
          carrierId: d.ownership === "subcontracted" ? carrierId : null,
        };
        const current = findExisting(d);
        if (!current) {
          toInsert.push({ ...target, status: "active" });
          result.drivers.created++;
          continue;
        }
        const changed =
          current.name !== target.name ||
          (current.cpf ?? null) !== target.cpf ||
          (current.phone ?? null) !== target.phone ||
          (current.licenseExpiry ?? null) !== target.licenseExpiry ||
          current.ownershipType !== target.ownershipType ||
          (current.carrierId ?? null) !== target.carrierId;
        if (!changed) {
          result.drivers.unchanged++;
          continue;
        }
        await tx
          .update(drivers)
          .set({ ...target, updatedAt: new Date() })
          .where(eq(drivers.id, current.id));
        result.drivers.updated++;
      }
      for (let i = 0; i < toInsert.length; i += 200) {
        await tx.insert(drivers).values(toInsert.slice(i, i + 200));
      }
    }

    // ---- vehicles --------------------------------------------------------------------------
    if (parsed.vehicles.length) {
      const plates = parsed.vehicles.map((v) => v.plate);
      const existing = await tx
        .select({
          id: vehicles.id,
          plate: vehicles.plate,
          vehicleType: vehicles.vehicleType,
          trackerProvider: vehicles.trackerProvider,
        })
        .from(vehicles)
        .where(inArray(vehicles.plate, plates));
      const byPlate = new Map(existing.map((v) => [v.plate, v]));

      const toInsert: (typeof vehicles.$inferInsert)[] = [];
      for (const v of parsed.vehicles) {
        const current = byPlate.get(v.plate);
        if (!current) {
          toInsert.push({
            plate: v.plate,
            vehicleType: v.vehicleType as (typeof vehicles.$inferInsert)["vehicleType"],
            trackerProvider: v.tracker,
            ownershipType: "subcontracted",
            carrierId,
            status: "active",
          });
          result.vehicles.created++;
          continue;
        }
        const changed =
          current.vehicleType !== v.vehicleType || (current.trackerProvider ?? null) !== v.tracker;
        if (!changed) {
          result.vehicles.unchanged++;
          continue;
        }
        await tx
          .update(vehicles)
          .set({
            vehicleType: v.vehicleType as (typeof vehicles.$inferInsert)["vehicleType"],
            trackerProvider: v.tracker,
            updatedAt: new Date(),
          })
          .where(eq(vehicles.id, current.id));
        result.vehicles.updated++;
      }
      for (let i = 0; i < toInsert.length; i += 200) {
        await tx.insert(vehicles).values(toInsert.slice(i, i + 200));
      }
    }

    // ---- trailers --------------------------------------------------------------------------
    if (parsed.trailers.length) {
      const plates = parsed.trailers.map((t) => t.plate);
      const existing = await tx
        .select({ id: trailers.id, plate: trailers.plate })
        .from(trailers)
        .where(inArray(trailers.plate, plates));
      const known = new Set(existing.map((t) => t.plate));

      const toInsert: (typeof trailers.$inferInsert)[] = [];
      for (const t of parsed.trailers) {
        if (known.has(t.plate)) {
          result.trailers.unchanged++;
          continue;
        }
        toInsert.push({
          plate: t.plate,
          // The workbook does not say what body the trailer has; `bau` is the linehaul default.
          trailerType: "bau",
          ownershipType: "subcontracted",
          carrierId,
          status: "active",
        });
        result.trailers.created++;
      }
      for (let i = 0; i < toInsert.length; i += 200) {
        await tx.insert(trailers).values(toInsert.slice(i, i + 200));
      }
    }
  });

  return result;
}
