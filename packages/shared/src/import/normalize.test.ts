import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import type { ParsingRules } from "../schemas/import";
import { normalizeDate, normalizeVehicleType } from "./normalize";

const RULES: ParsingRules = {
  dateFormats: [
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    "dd/MM/yyyy HH:mm",
    "dd/MM/yyyy HH:mm:ss",
    "dd-MM-yyyy HH:mm",
  ],
  timezone: "America/Sao_Paulo",
  decimalSeparator: ",",
  thousandSeparator: ".",
};

/** The instant a São Paulo wall-clock reading denotes, for comparing against the parsed result. */
function spInstant(iso: string): number {
  return DateTime.fromISO(iso, { zone: "America/Sao_Paulo" }).toMillis();
}

/**
 * Dates in a hand-maintained schedule (2026-08-15). 14 rows of the customer's first real file carried
 * a well-formed date wrapped in typing noise — a stray parenthesis, a trailing comma, a lost space.
 * Those are read; anything where the INSTANT itself is in doubt still throws, because cleaning
 * punctuation is not the same as deciding what someone meant.
 */
describe("normalizeDate", () => {
  it("parses a clean cell against the configured formats", () => {
    expect(normalizeDate("01/07/2026 16:00", RULES).getTime()).toBe(spInstant("2026-07-01T16:00"));
  });

  it("reads through a lost space between date and time", () => {
    expect(normalizeDate("01-07-202613:00", RULES).getTime()).toBe(spInstant("2026-07-01T13:00"));
  });

  it("reads through a trailing bracket, comma or semicolon", () => {
    expect(normalizeDate("14/07/2026 00:00)", RULES).getTime()).toBe(spInstant("2026-07-14T00:00"));
    expect(normalizeDate("15/07/2026 08:00:00,", RULES).getTime()).toBe(
      spInstant("2026-07-15T08:00"),
    );
  });

  it("reads through a leading colon", () => {
    expect(normalizeDate(": 01-08-2026 03:00", RULES).getTime()).toBe(
      spInstant("2026-08-01T03:00"),
    );
  });

  it("still refuses a cell whose instant is genuinely in doubt", () => {
    // A month typed as "088", and a cell holding nothing but a zero: both would be a guess.
    expect(() => normalizeDate("06/088/2026 05:00", RULES)).toThrow(/UNPARSEABLE_DATE/);
    expect(() => normalizeDate("0", RULES)).toThrow(/UNPARSEABLE_DATE/);
    expect(() => normalizeDate("", RULES)).toThrow(/UNPARSEABLE_DATE/);
  });

  it("never falls back to implicit JS parsing for an unconfigured format", () => {
    // "July 1, 2026" is what `new Date()` would happily accept — and exactly what must not happen.
    expect(() => normalizeDate("July 1, 2026", RULES)).toThrow(/UNPARSEABLE_DATE/);
  });
});

/**
 * Vehicle-type vocabulary (import engine). Real customer files write the yard's words, not the enum
 * spelling — a Shopee schedule alone carries "CARRETA - EX", "TRUCK - EX" and "3/4". Anything still
 * unrecognized must return null so the row is flagged (`UNMAPPABLE_VEHICLE_TYPE`), never guessed.
 */
describe("normalizeVehicleType", () => {
  it("maps the enum spellings unchanged", () => {
    for (const v of ["carreta", "truck", "toco", "vuc", "van", "bitruck", "bitrem", "rodotrem"]) {
      expect(normalizeVehicleType(v)).toBe(v);
    }
  });

  it("ignores case and accents", () => {
    expect(normalizeVehicleType("CARRETA")).toBe("carreta");
    expect(normalizeVehicleType("Três Quartos")).toBe("tres_quartos");
    expect(normalizeVehicleType("tres quartos")).toBe("tres_quartos");
  });

  it('drops a trailing commercial qualifier ("- EX", "- EXPRESSA")', () => {
    expect(normalizeVehicleType("CARRETA - EX")).toBe("carreta");
    expect(normalizeVehicleType("TRUCK - EX")).toBe("truck");
    expect(normalizeVehicleType("TRUCK-EX")).toBe("truck");
    // The customer's PORTAL spells the same arrangement out in full — 362 rows of one export.
    expect(normalizeVehicleType("CARRETA - EXPRESSA")).toBe("carreta");
    expect(normalizeVehicleType("TRUCK - EXPRESSA")).toBe("truck");
  });

  it("does not mistake a real type for a qualifier", () => {
    // "carreta ls" is its own vehicle, and there is no dash to drop.
    expect(normalizeVehicleType("CARRETA LS")).toBe("carreta_ls");
  });

  it('maps the yard shorthands "3/4" and "cavalo"', () => {
    expect(normalizeVehicleType("3/4")).toBe("tres_quartos");
    // A tractor unit is only ever dispatched pulling a semi-trailer.
    expect(normalizeVehicleType("CAVALO")).toBe("carreta");
  });

  it("maps carreta LS separately from a plain carreta", () => {
    expect(normalizeVehicleType("carreta ls")).toBe("carreta_ls");
    expect(normalizeVehicleType("CARRETA")).not.toBe("carreta_ls");
  });

  it("returns null for blank or unknown labels (caller flags, never guesses)", () => {
    expect(normalizeVehicleType("")).toBeNull();
    expect(normalizeVehicleType("   ")).toBeNull();
    expect(normalizeVehicleType("REVERSA")).toBeNull();
    expect(normalizeVehicleType("qualquer coisa")).toBeNull();
  });
});
