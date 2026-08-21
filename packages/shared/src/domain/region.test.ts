import { describe, expect, it } from "vitest";
import { regionPosition, REGION_ORDER } from "./region";

describe("regionPosition", () => {
  it("mantém a ordem declarada, não a alfabética", () => {
    const ordenadas = [...REGION_ORDER]
      .reverse()
      .sort((a, b) => regionPosition(a) - regionPosition(b));
    expect(ordenadas).toEqual([...REGION_ORDER]);
  });

  it("põe a região desconhecida no fim, e a sem região depois dela", () => {
    expect(regionPosition("NORTE")).toBe(REGION_ORDER.length);
    expect(regionPosition(null)).toBe(REGION_ORDER.length + 1);
  });
});
