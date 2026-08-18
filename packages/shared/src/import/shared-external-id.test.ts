import { describe, expect, it } from "vitest";
import { classifySharedExternalId, type SharedIdRow } from "./shared-external-id";

/**
 * The three shapes a repeated external id takes in a real file. Every fixture below is a real pair
 * from the Shopee schedule of 2026-08 (row numbers included), so a regression here is a regression
 * against data that actually shipped.
 */

const row = (r: Partial<SharedIdRow> & { rowNumber: number }): SharedIdRow => ({
  originCode: null,
  destinationCode: null,
  pickupStart: null,
  fingerprint: `f${r.rowNumber}`,
  ...r,
});

describe("classifySharedExternalId", () => {
  it("keeps one row when the file simply repeats the same movement (linhas 919/920)", () => {
    const verdict = classifySharedExternalId([
      row({
        rowNumber: 919,
        originCode: "SOC-MG2",
        destinationCode: "XPT-LMG-76",
        pickupStart: "2026-07-13T12:30:00Z",
        fingerprint: "same",
      }),
      row({
        rowNumber: 920,
        originCode: "SOC-MG2",
        destinationCode: "XPT-LMG-76",
        pickupStart: "2026-07-13T12:30:00Z",
        fingerprint: "same",
      }),
    ]);
    expect(verdict).toEqual({ kind: "identical", keep: 919, skip: [920] });
  });

  it("reads chained rows as legs of one operation (milk run, linhas 3687/3717)", () => {
    const verdict = classifySharedExternalId([
      row({
        rowNumber: 3687,
        originCode: "SOC-RJ2",
        destinationCode: "HUB-LMG-50",
        pickupStart: "2026-08-18T21:31:00Z",
      }),
      row({
        rowNumber: 3717,
        originCode: "HUB-LMG-50",
        destinationCode: "HUB-LMG-05",
        pickupStart: "2026-08-19T06:31:00Z",
      }),
    ]);
    expect(verdict.kind).toBe("legs");
    if (verdict.kind !== "legs") return;
    expect(verdict.legByRow.get(3687)).toBe(1);
    expect(verdict.legByRow.get(3717)).toBe(2);
  });

  it("numbers legs by pickup time, not by row order", () => {
    const verdict = classifySharedExternalId([
      row({
        rowNumber: 10,
        originCode: "B",
        destinationCode: "C",
        pickupStart: "2026-08-19T06:00:00Z",
      }),
      row({
        rowNumber: 90,
        originCode: "A",
        destinationCode: "B",
        pickupStart: "2026-08-18T20:00:00Z",
      }),
    ]);
    expect(verdict.kind).toBe("legs");
    if (verdict.kind !== "legs") return;
    expect(verdict.legByRow.get(90)).toBe(1); // departs first
    expect(verdict.legByRow.get(10)).toBe(2);
  });

  it("refuses two trucks on the same lane at the same hour, naming what differs (linhas 1485/1487)", () => {
    const verdict = classifySharedExternalId([
      row({
        rowNumber: 1485,
        originCode: "SOC-PE2",
        destinationCode: "HUB-LPE-03",
        pickupStart: "2026-07-20T21:30:00Z",
        fingerprint: "tarcisio",
      }),
      row({
        rowNumber: 1487,
        originCode: "SOC-PE2",
        destinationCode: "HUB-LPE-03",
        pickupStart: "2026-07-20T21:30:00Z",
        fingerprint: "luiz",
      }),
    ]);
    expect(verdict.kind).toBe("conflict");
    if (verdict.kind !== "conflict") return;
    expect(verdict.differences.get(1487)).toBe("recursos (motorista/veículo)");
  });

  it("refuses unrelated movements under one id, naming what differs (linhas 2852/2895)", () => {
    const verdict = classifySharedExternalId([
      row({
        rowNumber: 2852,
        originCode: "SOC-SP6",
        destinationCode: "SOC-CE3",
        pickupStart: "2026-08-07T21:00:00Z",
        fingerprint: "a",
      }),
      row({
        rowNumber: 2895,
        originCode: "SOC-RJ2",
        destinationCode: "SOC-CE3",
        pickupStart: "2026-08-08T10:00:00Z",
        fingerprint: "b",
      }),
    ]);
    expect(verdict.kind).toBe("conflict");
    if (verdict.kind !== "conflict") return;
    expect(verdict.differences.get(2895)).toBe("origem, horário de coleta");
  });

  it("does not invent legs when a pickup time is missing", () => {
    const verdict = classifySharedExternalId([
      row({
        rowNumber: 1,
        originCode: "A",
        destinationCode: "B",
        pickupStart: null,
        fingerprint: "a",
      }),
      row({
        rowNumber: 2,
        originCode: "B",
        destinationCode: "C",
        pickupStart: "2026-08-19T06:00:00Z",
        fingerprint: "b",
      }),
    ]);
    expect(verdict.kind).toBe("conflict");
  });

  it("chains three legs", () => {
    const verdict = classifySharedExternalId([
      row({
        rowNumber: 1,
        originCode: "A",
        destinationCode: "B",
        pickupStart: "2026-08-18T06:00:00Z",
      }),
      row({
        rowNumber: 2,
        originCode: "B",
        destinationCode: "C",
        pickupStart: "2026-08-18T12:00:00Z",
      }),
      row({
        rowNumber: 3,
        originCode: "C",
        destinationCode: "D",
        pickupStart: "2026-08-18T20:00:00Z",
      }),
    ]);
    expect(verdict.kind).toBe("legs");
    if (verdict.kind !== "legs") return;
    expect([...verdict.legByRow.values()]).toEqual([1, 2, 3]);
  });
});
