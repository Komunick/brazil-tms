import { DateTime } from "luxon";

/** Canonical display timezone for the product (PRD §21.6 / STACK §3.5). */
export const APP_TIME_ZONE = "America/Sao_Paulo";
export const APP_LOCALE = "pt-BR";

const EMPTY = "—";

function toDateTime(value: string | Date): DateTime {
  return value instanceof Date ? DateTime.fromJSDate(value) : DateTime.fromISO(value);
}

/** Parse a UTC value and shift it into the app timezone (America/Sao_Paulo). */
export function fromUtc(value: string | Date): DateTime {
  return toDateTime(value).setZone(APP_TIME_ZONE);
}

/** dd/MM/yyyy in America/Sao_Paulo, or an em dash for null/invalid input. */
export function formatDate(value: string | Date | null | undefined): string {
  if (value == null) return EMPTY;
  const dt = fromUtc(value);
  return dt.isValid ? dt.toFormat("dd/MM/yyyy") : EMPTY;
}

/** dd/MM/yyyy HH:mm in America/Sao_Paulo, or an em dash for null/invalid input. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value == null) return EMPTY;
  const dt = fromUtc(value);
  return dt.isValid ? dt.toFormat("dd/MM/yyyy HH:mm") : EMPTY;
}

/** Localized relative time (e.g. "há 2 horas"), or an em dash for null/invalid input. */
export function formatRelative(value: string | Date | null | undefined): string {
  if (value == null) return EMPTY;
  const dt = fromUtc(value);
  return dt.isValid ? (dt.toRelative({ locale: APP_LOCALE }) ?? EMPTY) : EMPTY;
}

/** Convert a DateTime/Date to a UTC ISO 8601 string for storage. */
export function toUtcIso(value: DateTime | Date): string {
  const dt = value instanceof Date ? DateTime.fromJSDate(value) : value;
  return dt.toUTC().toISO() ?? "";
}

/**
 * Format an integer amount of centavos as BRL currency (pt-BR).
 * Monetary amounts are stored as integer centavos; no money is displayed in feature 001 —
 * this helper exists for later features (FR-022).
 */
export function formatBRL(centavos: number): string {
  return new Intl.NumberFormat(APP_LOCALE, {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}
