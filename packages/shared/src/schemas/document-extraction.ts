import { z } from "zod";
import { vehicleTypeSchema } from "./master-data";

/**
 * AI document reading (021, issue #29): schema-validated extraction of Brazilian registration
 * documents — CNH → driver form, CRLV → vehicle/trailer forms. Every extracted field is NULLABLE:
 * the model is instructed to return null for anything unreadable/absent, and the UI lists those
 * fields instead of guessing (FR-003). Dates are calendar dates as "YYYY-MM-DD" strings (the same
 * shape the expiry form fields use). Output is PREFILL-ONLY — it never reaches a create/update
 * service directly (FR-004).
 */

export const EXTRACTION_DOC_TYPES = ["cnh", "crlv"] as const;
export type ExtractionDocType = (typeof EXTRACTION_DOC_TYPES)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD.")
  .nullable();

/** CNH → the driver form's mapped fields. */
export const cnhExtractionSchema = z.object({
  /** Full name as printed on the CNH. */
  name: z.string().trim().min(1).nullable(),
  /** CNH registration number ("nº registro"). */
  licenseNumber: z.string().trim().min(1).nullable(),
  /** Category ("cat. hab."), e.g. "AB", "E". */
  licenseCategory: z.string().trim().min(1).nullable(),
  /** CNH validity ("validade") as YYYY-MM-DD. */
  licenseExpiry: isoDate,
});
export type CnhExtraction = z.infer<typeof cnhExtractionSchema>;

/** CRLV → the vehicle/trailer forms' mapped fields. */
export const crlvExtractionSchema = z.object({
  /** Plate, uppercase, no separators (e.g. "ABC1D23"). */
  plate: z.string().trim().min(1).nullable(),
  /** Only when the CRLV type clearly maps onto the existing catalog; otherwise null. */
  vehicleType: vehicleTypeSchema.nullable(),
  /** Licensing/document validity as YYYY-MM-DD. */
  documentExpiry: isoDate,
});
export type CrlvExtraction = z.infer<typeof crlvExtractionSchema>;

/** Accepted upload media types (images + PDF). */
export const EXTRACTION_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;
export type ExtractionMediaType = (typeof EXTRACTION_MEDIA_TYPES)[number];

/** ~10 MB of raw bytes ≈ 13.4M base64 chars — refuse anything larger (also enforced client-side). */
export const EXTRACTION_MAX_BASE64_CHARS = 14_000_000;

/** Request body for POST /api/master-data/extract-document. */
export const extractDocumentRequestSchema = z.object({
  docType: z.enum(EXTRACTION_DOC_TYPES),
  mediaType: z.enum(EXTRACTION_MEDIA_TYPES),
  /** Base64 payload WITHOUT a data-URL prefix. Ephemeral — never persisted (FR-005). */
  data: z
    .string()
    .min(1, "Envie o arquivo do documento.")
    .max(EXTRACTION_MAX_BASE64_CHARS, "Arquivo muito grande (máximo 10 MB)."),
});
export type ExtractDocumentRequest = z.infer<typeof extractDocumentRequestSchema>;

/** Route response: the extracted fields + which mapped fields could not be read (pt-BR labels are the UI's job). */
export interface ExtractDocumentResult<T> {
  fields: T;
  /** Keys of `fields` that came back null — shown to the user as "não lidos" (FR-003). */
  unreadable: string[];
}

/** List the null fields of an extraction (the `unreadable` payload). */
export function unreadableFields(fields: Record<string, unknown>): string[] {
  return Object.entries(fields)
    .filter(([, value]) => value === null)
    .map(([key]) => key);
}
