import { describe, expect, it } from "vitest";
import { cellToString } from "./index";

/**
 * Cell → string, the step every xlsx import goes through. Pure, so it runs without a database.
 * The cases are the ones a real customer workbook throws at it: native dates, formulas whose cached
 * value was saved (and whose value was NOT), rich text, and cells typed as date that hold garbage.
 */
describe("cellToString", () => {
  it("keeps text and numbers as text", () => {
    expect(cellToString("SUDESTE")).toBe("SUDESTE");
    expect(cellToString(42)).toBe("42");
  });

  it("renders a native date as ISO (the engine parses it back with the template's zone)", () => {
    expect(cellToString(new Date("2026-07-01T00:00:00.000Z"))).toBe("2026-07-01T00:00:00.000Z");
  });

  it('reads an INVALID date as empty, never as "Invalid Date"', () => {
    expect(cellToString(new Date("nonsense"))).toBe("");
  });

  it("unwraps a formula's cached result, including a broken date inside it", () => {
    expect(cellToString({ formula: "VLOOKUP(...)", result: "SUDESTE" } as never)).toBe("SUDESTE");
    expect(cellToString({ formula: "VLOOKUP(...)", result: new Date("nonsense") } as never)).toBe(
      "",
    );
  });

  it("reads a formula with no cached value as empty (the export dropped it)", () => {
    expect(cellToString({ formula: "VLOOKUP(...)", result: null } as never)).toBe("");
  });

  it('never writes "[object Object]" for a shape it does not know', () => {
    expect(cellToString({ error: "#N/D" } as never)).toBe("");
  });

  it("joins rich text and takes a hyperlink's text", () => {
    expect(cellToString({ richText: [{ text: "SOC-" }, { text: "BA2" }] } as never)).toBe(
      "SOC-BA2",
    );
    expect(cellToString({ text: "CD São Paulo", hyperlink: "http://x" } as never)).toBe(
      "CD São Paulo",
    );
  });
});
