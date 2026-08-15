/**
 * What to do when two rows of the same file carry the SAME external trip id.
 *
 * 004 treated every repeat as ambiguous and refused both rows. A real customer file shows that is
 * three different situations wearing the same clothes (measured on a 3.8k-row Shopee schedule):
 *
 *  - IDÊNTICAS — the row was copy-pasted; both describe the same movement, down to the driver. Taking
 *    one loses nothing, so refusing both was pure friction.
 *  - PERNAS (milk run) — the customer plans one operation, and the truck ends a leg and departs from
 *    that same site on the next: `RJ → BH` then `BH → Contagem` the following morning. The id names
 *    the PROGRAMMING, not the movement. Refusing them means a daily route never imports.
 *  - CONFLITO — same id, movements that neither match nor chain (two trucks on one lane, or a code
 *    reused by accident). Here refusing is right: choosing wrongly would put the wrong driver, hour
 *    or destination on a trip and nobody would notice.
 *
 * Pure and deterministic: the caller (the detect-duplicates job) does the I/O. The chaining test is
 * structural — destination of one leg is the origin of the next, later in time — because the file's
 * own `SOLICITAÇÃO`/MILKRUN label does NOT mark these rows (verified: the 24 labelled rows all carry
 * distinct ids).
 */

export interface SharedIdRow {
  /** 1-based row number in the source file, as the user sees it. */
  rowNumber: number;
  originCode: string | null;
  destinationCode: string | null;
  /** Planned pickup as an ISO instant; rows without one cannot be ordered into legs. */
  pickupStart: string | null;
  /** Everything that identifies the movement, for the identical-rows test. */
  fingerprint: string;
}

export type SharedIdVerdict =
  | { kind: "identical"; keep: number; skip: number[] }
  | { kind: "legs"; legByRow: Map<number, number> }
  | { kind: "conflict"; differences: Map<number, string> };

const norm = (value: string | null): string => (value ?? "").trim().toUpperCase();

/** Rows sharing one external id → what they actually are. `rows` must have 2+ entries. */
export function classifySharedExternalId(rows: SharedIdRow[]): SharedIdVerdict {
  const ordered = [...rows].sort((a, b) => a.rowNumber - b.rowNumber);

  // 1. Identical: one movement typed twice. Keep the first occurrence.
  const fingerprints = new Set(ordered.map((r) => r.fingerprint));
  if (fingerprints.size === 1) {
    return {
      kind: "identical",
      keep: ordered[0]!.rowNumber,
      skip: ordered.slice(1).map((r) => r.rowNumber),
    };
  }

  // 2. Legs: order by pickup and require each leg to depart from where the previous one arrived.
  const byPickup = [...ordered].sort((a, b) =>
    (a.pickupStart ?? "").localeCompare(b.pickupStart ?? ""),
  );
  const chained =
    byPickup.every((r) => r.pickupStart && r.originCode && r.destinationCode) &&
    byPickup.every((r, i) => {
      if (i === 0) return true;
      const previous = byPickup[i - 1]!;
      return (
        norm(previous.destinationCode) === norm(r.originCode) &&
        (previous.pickupStart ?? "") < (r.pickupStart ?? "")
      );
    });
  if (chained) {
    return { kind: "legs", legByRow: new Map(byPickup.map((r, i) => [r.rowNumber, i + 1])) };
  }

  // 3. Conflict: say WHAT differs, per row, against the first one — a bare "duplicated" sends the
  //    operator hunting through thousands of lines.
  const first = ordered[0]!;
  const differences = new Map<number, string>();
  for (const row of ordered.slice(1)) {
    const diffs: string[] = [];
    if (norm(row.originCode) !== norm(first.originCode)) diffs.push("origem");
    if (norm(row.destinationCode) !== norm(first.destinationCode)) diffs.push("destino");
    if ((row.pickupStart ?? "") !== (first.pickupStart ?? "")) diffs.push("horário de coleta");
    if (!diffs.length) diffs.push("recursos (motorista/veículo)");
    differences.set(row.rowNumber, diffs.join(", "));
  }
  return { kind: "conflict", differences };
}
