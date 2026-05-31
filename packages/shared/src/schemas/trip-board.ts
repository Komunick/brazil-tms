import { z } from "zod";
import { BILLING_PHASE_STATUSES, TRIP_STATUSES } from "../domain/trip-status";
import { dateStringSchema, vehicleTypeSchema } from "./master-data";

/**
 * Feature 005 — Control Tower board query schema (R3/R8). This is the ONE validated parse for both the
 * shareable URL search params (client) and the BFF query (server-side filter/sort/paginate). The
 * plan-edit boundary schema (`updateTripPlanSchema`, R11) is NOT redefined here — it already lives in
 * `./trip` (the 003 trip schema) and was tightened there for the inline editor. Filters compose with
 * AND in the read model; unknown sort/scope/dir/over-range pagination → `400 VALIDATION`.
 */

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** Optional scalar param: a blank/null URL value collapses to `undefined` (absent). */
const optParam = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

/** One-or-many: a single repeated URL param (`?status=a&status=b`) or a lone value → an array. */
const oneOrMany = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (v) => (v == null || v === "" ? undefined : Array.isArray(v) ? v : [v]),
    z.array(schema).optional(),
  );

const uuidParam = (label: string) => optParam(z.string().uuid(`${label} inválido.`));

/** Sortable board columns (R2 whitelist) — anything else is a 400. */
export const TRIP_BOARD_SORTS = [
  "pickupStart",
  "customer",
  "status",
  "createdAt",
  "updatedAt",
] as const;

export type TripBoardSort = (typeof TRIP_BOARD_SORTS)[number];

export const TRIP_BOARD_DEFAULT_LIMIT = 50;
export const TRIP_BOARD_MAX_LIMIT = 200;

/**
 * The synchronous CSV export row cap (R13) — the SINGLE source of truth shared by the db export model
 * (default cap) and the client/UI over-cap message. A documented default pending Ops confirmation
 * (one of the seven BLOCKED items); not a magic number scattered across layers.
 */
export const EXPORT_ROW_CAP = 10_000;

// ---------------------------------------------------------------------------
// Board query (filter + sort + pagination)
// ---------------------------------------------------------------------------

export const tripBoardQuerySchema = z.object({
  customerId: uuidParam("Cliente"),
  status: oneOrMany(z.enum(TRIP_STATUSES)),
  billingStatus: optParam(z.enum(BILLING_PHASE_STATUSES)),
  originLocationId: uuidParam("Local de origem"),
  destinationLocationId: uuidParam("Local de destino"),
  laneId: uuidParam("Rota"),
  vehicleType: optParam(vehicleTypeSchema),
  pickupFrom: optParam(dateStringSchema),
  pickupTo: optParam(dateStringSchema),
  q: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().min(1).max(200).optional(),
  ),
  scope: z.enum(["active", "all"]).default("active"),
  sort: z.enum(TRIP_BOARD_SORTS).default("pickupStart"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  limit: z.coerce
    .number()
    .int("Limite inválido.")
    .min(1, "O limite deve ser ao menos 1.")
    .max(TRIP_BOARD_MAX_LIMIT, `O limite máximo é ${TRIP_BOARD_MAX_LIMIT}.`)
    .default(TRIP_BOARD_DEFAULT_LIMIT),
  offset: z.coerce.number().int("Deslocamento inválido.").min(0, "Deslocamento inválido.").default(0),
});

export type TripBoardQuery = z.infer<typeof tripBoardQuerySchema>;

/** Export query: the board filters/sort WITHOUT pagination (the cap is enforced server-side, R13). */
export const tripExportQuerySchema = tripBoardQuerySchema.omit({ limit: true, offset: true });

export type TripExportQuery = z.infer<typeof tripExportQuerySchema>;

// ---------------------------------------------------------------------------
// URLSearchParams ⇄ query (one place the board, the route, and CSV export all read filters)
// ---------------------------------------------------------------------------

const PARAM_KEYS = [
  "customerId",
  "billingStatus",
  "originLocationId",
  "destinationLocationId",
  "laneId",
  "vehicleType",
  "pickupFrom",
  "pickupTo",
  "q",
  "scope",
  "sort",
  "dir",
] as const;

function rawFromParams(params: URLSearchParams): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const key of PARAM_KEYS) {
    const value = params.get(key);
    if (value !== null) raw[key] = value;
  }
  const status = params.getAll("status");
  if (status.length > 0) raw.status = status;
  const limit = params.get("limit");
  if (limit !== null) raw.limit = limit;
  const offset = params.get("offset");
  if (offset !== null) raw.offset = offset;
  return raw;
}

/** Parse + validate the board query from URL search params (route + client share this). */
export function tripBoardQueryFromParams(params: URLSearchParams): TripBoardQuery {
  return tripBoardQuerySchema.parse(rawFromParams(params));
}

/** Parse + validate the export query (board filters without pagination). */
export function tripExportQueryFromParams(params: URLSearchParams): TripExportQuery {
  return tripExportQuerySchema.parse(rawFromParams(params));
}
