import { DateTime } from "luxon";
import type { ParsingRules } from "../schemas/import";

/**
 * EXPLICIT value normalization for the import engine (research.md R5; STACK §3.5).
 *
 * Implicit JS date parsing (`new Date(value)` / `Date.parse`) is FORBIDDEN: it is locale/runtime
 * dependent and silently accepts ambiguous input. Every date is parsed against each configured
 * Luxon format in the template's zone; anything ambiguous or unparseable THROWS so the worker can
 * mark the row `error` (it catches and records the reason). Pure, no I/O.
 */

/** Escape a separator so it can be used literally inside a RegExp (e.g. "." or "$"). */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Typing noise around an otherwise well-formed date, removed before matching the configured formats.
 * These are the shapes a real hand-maintained schedule produces, and each is unambiguous — nothing
 * about WHICH instant the cell means is being guessed:
 *
 *   "14-07-2026 00:00)"     stray bracket/parenthesis left from an edit
 *   "15/07/2026 08:00:00,"  trailing comma or semicolon
 *   ": 01-08-2026 03:00"    a leading colon or dash
 *   "01-07-202613:00"       the space between date and time lost on a paste
 *
 * A cell that is ambiguous after this — "06/088/2026", or a bare "0" — still throws. Cleaning
 * punctuation is not the same as deciding what someone meant, and only the first is safe here.
 */
function stripTypingNoise(value: string): string {
  let s = value.replace(/^[\s:;,\-–—]+/, "").replace(/[\s)\]}.,;]+$/, "");
  // A 4-digit year immediately followed by a time, with the separating space lost.
  s = s.replace(/(\d{4})(\d{1,2}:\d{2})/, "$1 $2");
  return s.trim();
}

/**
 * Parse a raw cell into a UTC instant using ONLY the template's configured formats.
 * Trims first; empty or no-format-matches throws. The matched DateTime is interpreted in the
 * template timezone (so "01/02/2026 08:00" in America/Sao_Paulo yields the correct UTC instant)
 * and converted to a UTC JS Date for storage.
 *
 * The cell is tried VERBATIM first; only if no configured format matches is `stripTypingNoise`
 * applied and the formats tried again. A file that is clean therefore behaves exactly as before.
 */
export function normalizeDate(value: string, rules: ParsingRules): Date {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error(`UNPARSEABLE_DATE: ${value}`);
  }
  const candidates = [trimmed];
  const cleaned = stripTypingNoise(trimmed);
  if (cleaned !== trimmed && cleaned !== "") candidates.push(cleaned);

  for (const candidate of candidates) {
    for (const fmt of rules.dateFormats) {
      const dt = DateTime.fromFormat(candidate, fmt, { zone: rules.timezone });
      if (dt.isValid) {
        return dt.toUTC().toJSDate();
      }
    }
  }
  // No configured format matched (or dateFormats is empty). Never fall back to implicit parsing.
  throw new Error(`UNPARSEABLE_DATE: ${value}`);
}

/**
 * Brazilian road-vehicle vocabulary → the `vehicle_type` enum. Customer files write the type the way
 * the yard says it, not the way the enum spells it, so this covers the DOMAIN vocabulary (accents,
 * "3/4", "cavalo") — it is NOT per-customer config: a customer's own words belong in its template.
 *
 * Two generic rules run before the lookup:
 *  - accents/punctuation folded and whitespace collapsed ("Três Quartos" → "tres quartos");
 *  - a trailing qualifier after " - " is dropped ("CARRETA - EX" → "carreta"): it marks a commercial
 *    arrangement (exclusive/dedicated), never a different vehicle.
 */
const VEHICLE_TYPE_SYNONYMS: Record<string, string> = {
  van: "van",
  vuc: "vuc",
  "3/4": "tres_quartos",
  "3 4": "tres_quartos",
  "tres quartos": "tres_quartos",
  tres_quartos: "tres_quartos",
  toco: "toco",
  truck: "truck",
  truk: "truck",
  bitruck: "bitruck",
  carreta: "carreta",
  cavalo: "carreta", // a tractor unit only runs pulling a semi-trailer
  "carreta ls": "carreta_ls",
  carreta_ls: "carreta_ls",
  ls: "carreta_ls",
  bitrem: "bitrem",
  rodotrem: "rodotrem",
};

/**
 * Map a raw vehicle-type cell to the `vehicle_type` enum, or null when it is not recognizable
 * (the caller records `UNMAPPABLE_VEHICLE_TYPE` — never guesses).
 */
export function normalizeVehicleType(value: string): string | null {
  const folded = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  if (folded === "") return null;
  // "carreta - ex" / "truck-ex" → the base type; the suffix is a commercial marker.
  const base = folded.replace(/\s*-\s*[a-z0-9]{1,3}$/, "").trim();
  return VEHICLE_TYPE_SYNONYMS[folded] ?? VEHICLE_TYPE_SYNONYMS[base] ?? null;
}

/**
 * Parse a raw cell into a number honoring the template's thousand/decimal separators
 * (e.g. "1.234,56" with thousand "." and decimal "," → 1234.56). Strips thousand separators,
 * swaps the decimal separator for ".", then asserts a strict numeric shape before `Number(...)`.
 * Anything else throws.
 */
export function normalizeNumber(value: string, rules: ParsingRules): number {
  let s = value.trim();
  if (rules.thousandSeparator !== "") {
    s = s.replace(new RegExp(escapeRegExp(rules.thousandSeparator), "g"), "");
  }
  if (rules.decimalSeparator !== "") {
    s = s.replace(new RegExp(escapeRegExp(rules.decimalSeparator), "g"), ".");
  }
  if (!/^[-+]?\d*\.?\d+$/.test(s)) {
    throw new Error(`UNPARSEABLE_NUMBER: ${value}`);
  }
  return Number(s);
}
