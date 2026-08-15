/**
 * The operational annotations the TEAM fills in, as opposed to what the customer's file says.
 *
 * Why they are a closed list and not free text: each one exists today only as a column of a
 * hand-maintained spreadsheet, and the point of naming them here is to give them a home in the TMS
 * so that spreadsheet can be switched off (2026-08-15). A fixed list keeps every trip answering the
 * same questions — a free-form bag would drift into five spellings of "SM Raster" within a month.
 *
 * Adding one is a one-line change here plus its pt-BR label; that is deliberately cheap, because the
 * list belongs to the operation and will grow. `maxLength` is the storage guard, not a business rule.
 */
export const OPERATIONAL_FIELDS = ["solicitacao", "checklist", "smRaster", "cte", "doca"] as const;

export type OperationalField = (typeof OPERATIONAL_FIELDS)[number];

/** Longest value accepted per field. These are references and short notes, never documents. */
export const OPERATIONAL_FIELD_MAX_LENGTH = 120;

/** The label each field carries on screen and in the customer's own vocabulary. */
export const OPERATIONAL_FIELD_LABELS: Record<OperationalField, string> = {
  solicitacao: "Solicitação",
  checklist: "Checklist",
  smRaster: "SM Raster",
  cte: "CT-e",
  doca: "Doca",
};
