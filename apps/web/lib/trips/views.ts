import { DateTime } from "luxon";
import { APP_TIME_ZONE } from "@brazil-tms/shared";

/**
 * Default Control Tower board views (feature 005). Each view is a named preset that produces a flat
 * string map suitable for `URLSearchParams` / `useTripBoardFilters().setFilters`. `labelKey` is an
 * i18n key under `Trips.board` (e.g. `"viewToday"`). Plain in-memory array — no persistence, no
 * server-only dependency (importable by client components).
 *
 * EXTENSIBLE REGISTRY: later slices append their own views once their filter dimensions exist —
 * 006 → "Unassigned" (assigned driver/vehicle/carrier), 007 → "At risk" (SLA-risk), 008 →
 * "Missing documents". Those are NOT added here (their backing filters/indexes do not exist yet);
 * keep this array as the single place to register new presets.
 */
export interface TripBoardView {
  key: string;
  /** i18n key under `Trips.board`. */
  labelKey: string;
  /** Flat string map of board params (consumed by URLSearchParams). */
  params: () => Record<string, string>;
}

/** Today (BRT), as `yyyy-MM-dd`. */
function today(): string {
  return DateTime.now().setZone(APP_TIME_ZONE).toISODate() ?? "";
}

/** Tomorrow (BRT), as `yyyy-MM-dd`. */
function tomorrow(): string {
  return DateTime.now().setZone(APP_TIME_ZONE).plus({ days: 1 }).toISODate() ?? "";
}

export const DEFAULT_TRIP_VIEWS: TripBoardView[] = [
  {
    key: "today",
    labelKey: "viewToday",
    params: () => ({ pickupFrom: today(), pickupTo: today(), scope: "all" }),
  },
  {
    key: "next24h",
    labelKey: "viewNext24h",
    params: () => ({ pickupFrom: today(), pickupTo: tomorrow(), scope: "all" }),
  },
  {
    key: "inTransit",
    labelKey: "viewInTransit",
    params: () => ({ status: "in_transit", scope: "all" }),
  },
  {
    key: "billingPending",
    labelKey: "viewBillingPending",
    params: () => ({ billingStatus: "billing_pending", scope: "all" }),
  },
];
