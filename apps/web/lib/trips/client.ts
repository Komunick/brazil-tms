"use client";

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  EXPORT_ROW_CAP,
  tripBoardQueryFromParams,
  type TripBoardQuery,
  type UpdateTripPlanInput,
} from "@brazil-tms/shared";
import type { TripBoardRow, TripDetailView, DashboardSummary } from "@brazil-tms/db";

/**
 * Client data layer for the Control Tower (feature 005): TanStack Query hooks, URL filter state,
 * and the CSV export href. Read-first — freshness is polling (per-hook `refetchInterval`), NO
 * Realtime (Constitution). The browser never talks to Postgres; everything goes through the BFF
 * under `/api/trips/*` and `/api/dashboard/*`. db view types are imported TYPE-ONLY (erased at
 * build) so this client file carries no server-side db dependency.
 */

// --- Poll/cap constants --------------------------------------------------------------------------

/** Control Tower board — dense active-trips list; 30s polling (plan: Performance Goals, R-poll). */
export const CONTROL_TOWER_POLL_MS = 30_000;
/** Home daily dashboard — coarser aggregates; 60s polling. */
export const DASHBOARD_POLL_MS = 60_000;
/** Trip Detail — operational view that may be edited; 30s polling. */
export const TRIP_DETAIL_POLL_MS = 30_000;
/** Synchronous CSV export row cap (R13); single source in @brazil-tms/shared, re-exported for UI copy. */
export { EXPORT_ROW_CAP };

// --- Error + fetch helpers (mirror apps/web/lib/master-data/client.ts) ----------------------------

export interface ApiErrorBody {
  code: string;
  message: string;
  issues?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
}

/** Read a `{ error: { code, message, issues? } }` body; null if absent/unparseable. */
export async function readApiError(res: Response): Promise<ApiErrorBody | null> {
  try {
    const body = (await res.json()) as { error?: ApiErrorBody };
    return body.error ?? null;
  } catch {
    return null;
  }
}

/** A thrown error carrying the API error code, so mutation onError can map it to a pt-BR message. */
export class TripsError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "TripsError";
  }
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await readApiError(res);
    throw new TripsError(err?.code ?? "REQUEST_FAILED");
  }
  return (await res.json()) as T;
}

// --- Query keys ----------------------------------------------------------------------------------

const TRIPS_ROOT = ["trips"] as const;

/** `search` is the URL query string (e.g. `useSearchParams().toString()`). */
export function tripBoardKey(search: string): unknown[] {
  return [...TRIPS_ROOT, "board", search];
}

export function tripDetailKey(id: string): unknown[] {
  return [...TRIPS_ROOT, "detail", id];
}

export function dashboardKey(): unknown[] {
  return [...TRIPS_ROOT, "dashboard"];
}

// --- Response shapes -----------------------------------------------------------------------------

export interface TripBoardResponse {
  items: TripBoardRow[];
  total: number;
  limit: number;
  offset: number;
}

// --- Read hooks ----------------------------------------------------------------------------------

/** Control Tower board. `search` is the URL query string; pass `searchParams.toString()`. */
export function useTripBoard(search: string): UseQueryResult<TripBoardResponse> {
  return useQuery({
    queryKey: tripBoardKey(search),
    queryFn: async () => asJson<TripBoardResponse>(await fetch(`/api/trips?${search}`)),
    refetchInterval: CONTROL_TOWER_POLL_MS,
  });
}

/** Trip Detail for a single trip (404 → TripsError("NOT_FOUND")). */
export function useTripDetail(id: string): UseQueryResult<{ item: TripDetailView }> {
  return useQuery({
    queryKey: tripDetailKey(id),
    queryFn: async () => asJson<{ item: TripDetailView }>(await fetch(`/api/trips/${id}`)),
    refetchInterval: TRIP_DETAIL_POLL_MS,
    enabled: Boolean(id),
  });
}

/** Home daily dashboard aggregates. */
export function useDashboardSummary(): UseQueryResult<{ summary: DashboardSummary }> {
  return useQuery({
    queryKey: dashboardKey(),
    queryFn: async () => asJson<{ summary: DashboardSummary }>(await fetch(`/api/dashboard/summary`)),
    refetchInterval: DASHBOARD_POLL_MS,
  });
}

// --- Write hook (operational-field edits; reuses 003 updateTripPlan via the BFF) ------------------

/**
 * Edit live planned fields before completion. Invalidating the `["trips"]` root refreshes both the
 * board and the detail. Error codes (mapped to pt-BR by the caller): EDIT_NOT_ALLOWED,
 * REVIEW_REQUIRED, STALE_TRANSITION, NOT_FOUND, VALIDATION.
 */
export function useUpdateTripPlan(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateTripPlanInput) => {
      const res = await fetch(`/api/trips/${id}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return asJson<{ item: TripDetailView }>(res);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TRIPS_ROOT });
    },
  });
}

// --- CSV export ----------------------------------------------------------------------------------

/**
 * The CSV export is a direct browser navigation/anchor download (NOT a fetch hook). `search` is the
 * board query string WITHOUT limit/offset; the cap (EXPORT_ROW_CAP) is enforced server-side.
 */
export function exportHref(search: string): string {
  return `/api/trips/export?${search}`;
}

// --- URL filter state ----------------------------------------------------------------------------

type FilterValue = string | string[] | undefined;

export interface TripBoardFilters {
  /** Validated board query parsed from the current URL (falls back to defaults on parse error). */
  query: TripBoardQuery;
  /** The current URL query string (`searchParams.toString()`). */
  search: string;
  /** Merge `next` into the current params (delete on empty; arrays replaced); resets offset on filter change. */
  setFilters: (next: Partial<Record<string, FilterValue>>) => void;
  /** Set/clear a single param (sugar over setFilters). */
  setParam: (key: string, value: FilterValue) => void;
  /** Clear all params. */
  reset: () => void;
}

/** Keys whose change does NOT reset pagination (pagination/sort controls themselves). */
const NON_RESETTING_KEYS = new Set(["offset", "limit", "sort", "dir"]);

function isEmpty(value: FilterValue): boolean {
  return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

/** URL-as-state for the Control Tower board: parse + mutate filters via the router (shallow replace). */
export function useTripBoardFilters(): TripBoardFilters {
  const searchParams = useSearchParams();
  const router = useRouter();

  const search = searchParams.toString();

  let query: TripBoardQuery;
  try {
    query = tripBoardQueryFromParams(new URLSearchParams(search));
  } catch {
    query = tripBoardQueryFromParams(new URLSearchParams());
  }

  const setFilters = useCallback(
    (next: Partial<Record<string, FilterValue>>) => {
      const params = new URLSearchParams(searchParams.toString());

      let changedFilter = false;
      for (const [key, value] of Object.entries(next)) {
        params.delete(key);
        if (!isEmpty(value)) {
          if (Array.isArray(value)) {
            for (const v of value) params.append(key, v);
          } else {
            params.set(key, value as string);
          }
        }
        if (!NON_RESETTING_KEYS.has(key)) changedFilter = true;
      }

      // Reset pagination on any actual filter change (good UX): jump back to the first page.
      if (changedFilter) params.set("offset", "0");

      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const setParam = useCallback(
    (key: string, value: FilterValue) => setFilters({ [key]: value }),
    [setFilters],
  );

  const reset = useCallback(() => {
    router.replace("?");
  }, [router]);

  return { query, search, setFilters, setParam, reset };
}
