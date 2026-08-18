import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseRegistryWorkbook } from "./registry-import";

/**
 * Parsing of the customer workbook into fleet-registry records. Pure (no DB), so it runs in the
 * default suite. The fixtures reproduce what the real file does: registry sheets that do NOT start
 * on row 1, a typo in the header ("TIIPO"), CPFs with a bad check digit, phones with a duplicated
 * DDD, and the same CPF under two different names.
 */

/** Build an in-memory workbook: `sheets[name] = rows`, written starting at `startRow`. */
async function workbook(
  sheets: Record<string, { startRow: number; rows: (string | null)[][] }>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, spec] of Object.entries(sheets)) {
    const sheet = wb.addWorksheet(name);
    spec.rows.forEach((row, i) => {
      const target = sheet.getRow(spec.startRow + i);
      row.forEach((value, c) => {
        if (value !== null) target.getCell(c + 1).value = value;
      });
      target.commit();
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const DRIVER_HEADER = [
  "STATUS",
  "MOTORISTA",
  "FROTA / AGREGADO",
  "CPF",
  "TELEFONE",
  "VENCIMENTO CNH",
];
const FLEET_HEADER = ["PLACA", "TIIPO", "TECNOLOGIA", null, "CARRETA", "CARRETA 2"];

describe("parseRegistryWorkbook — MOTORISTAS", () => {
  it("maps the agreed columns and finds the header below row 1", async () => {
    const bytes = await workbook({
      MOTORISTAS: {
        startRow: 3,
        rows: [
          DRIVER_HEADER,
          [
            "APROVADO",
            "JOAO CARLOS",
            "AGREGADO",
            "390.533.447-05",
            "(75) 98886-1286",
            "2031-11-18",
          ],
          ["APROVADO", "MARIA SOUZA", "FROTA", "529.982.247-25", "11999998888", "18/11/2031"],
        ],
      },
    });
    const parsed = await parseRegistryWorkbook(bytes);

    expect(parsed.drivers).toHaveLength(2);
    expect(parsed.drivers[0]).toMatchObject({
      name: "JOAO CARLOS",
      cpf: "39053344705",
      phone: "75988861286",
      licenseExpiry: "2031-11-18",
      ownership: "subcontracted",
    });
    // FROTA is our own fleet, and dd/MM/yyyy parses like the ISO the native Excel date produces.
    expect(parsed.drivers[1]).toMatchObject({ ownership: "owned", licenseExpiry: "2031-11-18" });
    expect(parsed.missingSheets).toEqual(["VEÍCULOSCARRETAS"]);
  });

  it("loads an invalid CPF as-is and warns (business call)", async () => {
    const bytes = await workbook({
      MOTORISTAS: {
        startRow: 3,
        rows: [DRIVER_HEADER, ["APROVADO", "ADRIANO LUIZ", "AGREGADO", "448636328", "", ""]],
      },
    });
    const parsed = await parseRegistryWorkbook(bytes);

    expect(parsed.drivers[0]!.cpf).toBe("448636328");
    expect(parsed.warnings.map((w) => w.code)).toContain("cpf_invalido");
  });

  it("treats one CPF with two spellings of one name as a single driver", async () => {
    const bytes = await workbook({
      MOTORISTAS: {
        startRow: 3,
        rows: [
          DRIVER_HEADER,
          ["APROVADO", "ARTUR BORGES SANT ANA NETO", "AGREGADO", "390.533.447-05", "", ""],
          ["APROVADO", "ARTUR BORGES SANTANA NETO", "AGREGADO", "390.533.447-05", "", ""],
        ],
      },
    });
    const parsed = await parseRegistryWorkbook(bytes);

    const warning = parsed.warnings.find((w) => w.code === "nome_divergente");
    expect(warning?.detail).toContain("um cadastro só");
    expect(parsed.warnings.some((w) => w.code === "cpf_compartilhado")).toBe(false);
  });

  it("tolerates a typo in the first name, but not a different first name", async () => {
    const bytes = await workbook({
      MOTORISTAS: {
        startRow: 3,
        rows: [
          DRIVER_HEADER,
          ["APROVADO", "DASSAIVEL MOREIRA DE BARROS", "AGREGADO", "390.533.447-05", "", ""],
          ["APROVADO", "DASSAIEVEL MOREIRA DE BARROS", "AGREGADO", "390.533.447-05", "", ""],
          // A three-letter first name stays strict: one letter apart is a different person.
          ["APROVADO", "ANA SOUZA LIMA", "AGREGADO", "529.982.247-25", "", ""],
          ["APROVADO", "ANO SOUZA LIMA", "AGREGADO", "529.982.247-25", "", ""],
        ],
      },
    });
    const parsed = await parseRegistryWorkbook(bytes);

    const codes = parsed.warnings.map((w) => w.code);
    expect(codes).toContain("nome_divergente"); // DASSAIVEL ≈ DASSAIEVEL
    expect(codes).toContain("cpf_compartilhado"); // ANA ≠ ANO
  });

  it("keeps both people when one CPF carries two names, and says so", async () => {
    const bytes = await workbook({
      MOTORISTAS: {
        startRow: 3,
        rows: [
          DRIVER_HEADER,
          ["APROVADO", "ALISSON RODRIGUES", "AGREGADO", "056.294.236-06", "", ""],
          ["APROVADO", "WELITON LUIZ SIMIAO", "AGREGADO", "056.294.236-06", "", ""],
        ],
      },
    });
    const parsed = await parseRegistryWorkbook(bytes);

    expect(parsed.drivers).toHaveLength(2);
    const shared = parsed.warnings.find((w) => w.code === "cpf_compartilhado");
    expect(shared?.detail).toContain("ALISSON RODRIGUES");
    expect(shared?.detail).toContain("WELITON LUIZ SIMIAO");
    expect(shared?.detail).toContain("corrija o CPF na origem");
  });

  it("blanks a phone that is not 10–11 digits and warns", async () => {
    const bytes = await workbook({
      MOTORISTAS: {
        startRow: 3,
        rows: [DRIVER_HEADER, ["APROVADO", "TEL RUIM", "FROTA", "", "119986421644", ""]],
      },
    });
    const parsed = await parseRegistryWorkbook(bytes);

    expect(parsed.drivers[0]!.phone).toBeNull();
    expect(parsed.warnings.map((w) => w.code)).toContain("telefone_invalido");
  });
});

describe("parseRegistryWorkbook — VEÍCULOSCARRETAS", () => {
  it("splits tractors from trailers across the agreed columns", async () => {
    const bytes = await workbook({
      VEÍCULOSCARRETAS: {
        startRow: 4,
        rows: [
          FLEET_HEADER,
          ["AQN0G13", "CAVALO", "SASCAR", null, "ATP4E66", "PKN4530"],
          ["TNA4D65", "TRUCK", "", null, "GBN3136", null],
        ],
      },
    });
    const parsed = await parseRegistryWorkbook(bytes);

    expect(parsed.vehicles).toEqual([
      expect.objectContaining({ plate: "AQN0G13", vehicleType: "cavalo", tracker: "SASCAR" }),
      expect.objectContaining({ plate: "TNA4D65", vehicleType: "truck", tracker: null }),
    ]);
    // Both trailer columns feed the same registry.
    expect(parsed.trailers.map((t) => t.plate)).toEqual(["ATP4E66", "PKN4530", "GBN3136"]);
  });

  it("ignores a malformed plate and warns instead of guessing", async () => {
    const bytes = await workbook({
      VEÍCULOSCARRETAS: {
        startRow: 4,
        rows: [FLEET_HEADER, ["ASP 8G8", "CAVALO", "", null, "XX", null]],
      },
    });
    const parsed = await parseRegistryWorkbook(bytes);

    expect(parsed.vehicles).toHaveLength(0);
    expect(parsed.trailers).toHaveLength(0);
    expect(parsed.warnings.filter((w) => w.code === "placa_invalida")).toHaveLength(2);
  });

  it("never lists a plate as both tractor and trailer", async () => {
    const bytes = await workbook({
      VEÍCULOSCARRETAS: {
        startRow: 4,
        rows: [
          FLEET_HEADER,
          ["AQN0G13", "CAVALO", "", null, "ATP4E66", null],
          ["ATP4E66", "CAVALO", "", null, null, null],
        ],
      },
    });
    const parsed = await parseRegistryWorkbook(bytes);

    expect(parsed.vehicles.map((v) => v.plate)).toContain("ATP4E66");
    expect(parsed.trailers.map((t) => t.plate)).not.toContain("ATP4E66");
  });

  it("reports both sheets as missing when the workbook is something else entirely", async () => {
    const bytes = await workbook({ Planilha1: { startRow: 1, rows: [["a", "b"]] } });
    const parsed = await parseRegistryWorkbook(bytes);

    expect(parsed.missingSheets).toEqual(["MOTORISTAS", "VEÍCULOSCARRETAS"]);
    expect(parsed.drivers).toHaveLength(0);
  });
});
