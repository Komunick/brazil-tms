import type { TemplateConfig } from "../schemas/import";
import { MAPPED_DATE_FIELDS } from "../schemas/import";

/**
 * A milk run written INSIDE ONE ROW (2026-08-15). The customer's schedule expresses a chained
 * operation in two ways: two rows sharing the id (handled downstream by `classifySharedExternalId`)
 * and — in 38 rows of the first real file — a SINGLE row whose station and time cells hold both
 * movements stacked with Alt+Enter:
 *
 *   ESTAÇÃO ORIGEM   "SOC-RJ2 | SOC_RJ_DUQUE DE CAXIAS\nHUB-LMG-50 | LM HUB_MG_BELO HORIZONTE_02"
 *   ESTAÇÃO DESTINO  "HUB-LMG-50 | LM HUB_MG_BELO HORIZONTE_02\nHUB-LMG-05 | LM HUB_MG_CONTAGEM"
 *   ETA ORIGEM       "01/7/2026 16:00\n02/7/2026 02:00"
 *   MOTORISTA        "<um nome só>"                    ← o mesmo motorista roda as duas pernas
 *
 * Read as one cell, none of it resolves: the stations are unknown and the dates unparseable, so all
 * 38 rows failed. `expandStackedRow` turns such a row into ONE RAW ROW PER LEG, which the existing
 * leg machinery (leg-numbered trips, sibling display) then handles unchanged.
 *
 * The rules are deliberately narrow — this splits what the file states, it never infers a movement:
 *
 *  - The LEG COUNT comes from the origin and destination columns alone (the movement's identity).
 *    They must agree; if they don't, the row is left whole and fails as before. Guessing which of
 *    three origins pairs with which of two destinations is inventing a trip.
 *  - A cell with the SAME number of lines is read per-leg (line i → leg i).
 *  - A cell with ONE line is shared by every leg — but only when it is NOT a date. One driver, one
 *    plate and one region legitimately cover the whole operation; ONE TIME DOES NOT. Copying leg 1's
 *    pickup onto leg 2 would fabricate a schedule, so later legs get it empty and the validate stage
 *    refuses them by name, pointing the operator at the row that is genuinely incomplete.
 *  - Any other line count is a mismatch: line i when it exists, empty otherwise. Never recycled.
 */

const DATE_TARGETS = new Set<string>(MAPPED_DATE_FIELDS);

/** Cell → its lines, blank ones dropped (a trailing Alt+Enter is not a leg). */
function linesOf(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** The raw column names mapped to the two ends of the movement, in template order. */
function endColumns(template: TemplateConfig): string[] {
  return template.columnMappings
    .filter((m) => m.target === "originCode" || m.target === "destinationCode")
    .map((m) => m.source);
}

/**
 * One raw row → one raw row per leg. Returns a single-element array (the row itself, untouched) for
 * the overwhelming majority: no stacked ends, ends that disagree on how many legs there are, or a
 * template that maps no ends at all.
 */
export function expandStackedRow(
  raw: Record<string, string>,
  template: TemplateConfig,
): Record<string, string>[] {
  const ends = endColumns(template);
  if (ends.length === 0) return [raw];

  const endCounts = ends.map((column) => linesOf(raw[column]).length);
  const legCount = endCounts[0]!;
  if (legCount < 2) return [raw];
  // The ends must tell the same story about how many movements this row holds.
  if (endCounts.some((count) => count !== legCount)) return [raw];

  const dateColumns = new Set(
    template.columnMappings.filter((m) => DATE_TARGETS.has(m.target)).map((m) => m.source),
  );

  const legs: Record<string, string>[] = [];
  for (let leg = 0; leg < legCount; leg++) {
    const legRow: Record<string, string> = {};
    for (const [column, value] of Object.entries(raw)) {
      const lines = linesOf(value);
      if (lines.length === legCount) {
        legRow[column] = lines[leg]!;
      } else if (lines.length === 1) {
        // Shared across legs — except a time, which belongs to exactly one movement.
        legRow[column] = dateColumns.has(column) && leg > 0 ? "" : lines[0]!;
      } else {
        legRow[column] = lines[leg] ?? "";
      }
    }
    legs.push(legRow);
  }
  return legs;
}
