import { describe, expect, it } from "vitest";
import { normalizeVehicleType } from "./normalize";

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

  it('drops a trailing commercial qualifier ("- EX")', () => {
    expect(normalizeVehicleType("CARRETA - EX")).toBe("carreta");
    expect(normalizeVehicleType("TRUCK - EX")).toBe("truck");
    expect(normalizeVehicleType("TRUCK-EX")).toBe("truck");
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
