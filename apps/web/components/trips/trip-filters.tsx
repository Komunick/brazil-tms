"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BILLING_PHASE_STATUSES,
  TRIP_STATUSES,
  VEHICLE_TYPE_VALUES,
  type TripBoardQuery,
  type TripStatus,
} from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TripStatusBadge } from "@/components/trips/trip-status-badge";
import { exportHref } from "@/lib/trips/client";
import { DEFAULT_TRIP_VIEWS } from "@/lib/trips/views";
import { useEntityList } from "@/lib/master-data/client";
import type { CustomerDto } from "@/lib/master-data/customers-service";
import type { LocationDto } from "@/lib/master-data/locations-service";
import type { LaneDto } from "@/lib/master-data/lanes-service";
import { cn } from "@/lib/utils";

type FilterValue = string | string[] | undefined;

/**
 * Control Tower board filters (feature 005, US1 + US5 export). All filters compose with AND in the
 * read model; each change calls `setFilters`, which resets pagination. Read-first — the dropdowns
 * reuse the 002 master-data list hooks (customers/locations/lanes). Locations are listed globally
 * (the list endpoint's `customerId` is optional), so origin/destination are independent of the
 * customer filter. Lanes carry no display label, so their option label is derived `O → D` from the
 * locations code map. NO controls for assigned driver/vehicle/carrier or SLA risk — those dimensions
 * belong to later slices (006/007); only TRIP-002's 005-owned dimensions are built here.
 */
export function TripFilters({
  query,
  setFilters,
  reset,
  search,
}: {
  query: TripBoardQuery;
  setFilters: (next: Partial<Record<string, FilterValue>>) => void;
  reset: () => void;
  search: string;
}) {
  const t = useTranslations("Trips");
  const tCommon = useTranslations("Common");
  const tVehicle = useTranslations("VehicleTypes");

  // Local search box state, synced to the URL `q` param on submit (Enter / blur).
  const [q, setQ] = useState(query.q ?? "");
  useEffect(() => {
    setQ(query.q ?? "");
  }, [query.q]);

  const customers = useEntityList<CustomerDto>("customers");
  const locations = useEntityList<LocationDto>("locations");
  const lanes = useEntityList<LaneDto>("lanes");

  const locationList = locations.data ?? [];
  const codeOf = new Map(locationList.map((l) => [l.id, l.code]));

  const statusSet = new Set<TripStatus>(query.status ?? []);

  function toggleStatus(status: TripStatus) {
    const next = new Set(statusSet);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    setFilters({ status: Array.from(next) });
  }

  function applySearch() {
    const trimmed = q.trim();
    setFilters({ q: trimmed === "" ? undefined : trimmed });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {/* Search + scope + views ---------------------------------------------------------- */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1 space-y-1.5">
            <Label htmlFor="trip-search">{tCommon("search")}</Label>
            <Input
              id="trip-search"
              type="search"
              placeholder={t("board.searchPlaceholder")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={applySearch}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applySearch();
                }
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("board.filterScope")}</Label>
            <div className="flex gap-1">
              {(["active", "all"] as const).map((scope) => (
                <Button
                  key={scope}
                  type="button"
                  size="sm"
                  variant={query.scope === scope ? "default" : "outline"}
                  onClick={() => setFilters({ scope })}
                >
                  {scope === "active" ? t("board.scopeActive") : t("board.scopeAll")}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick views --------------------------------------------------------------------- */}
        <div className="space-y-1.5">
          <Label>{t("board.views")}</Label>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_TRIP_VIEWS.map((view) => (
              <Button
                key={view.key}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setFilters(view.params())}
              >
                {t(`board.${view.labelKey}`)}
              </Button>
            ))}
          </div>
        </div>

        {/* Data-backed filters (AND) ------------------------------------------------------- */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t("board.filterCustomer")}</Label>
            <Select
              value={query.customerId ?? ""}
              onValueChange={(v) => setFilters({ customerId: v === "__all__" ? undefined : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("board.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("board.all")}</SelectItem>
                {(customers.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("board.filterBillingStatus")}</Label>
            <Select
              value={query.billingStatus ?? ""}
              onValueChange={(v) => setFilters({ billingStatus: v === "__all__" ? undefined : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("board.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("board.all")}</SelectItem>
                {BILLING_PHASE_STATUSES.map((b) => (
                  <SelectItem key={b} value={b}>
                    {t(`billingStatus.${b}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("board.filterVehicleType")}</Label>
            <Select
              value={query.vehicleType ?? ""}
              onValueChange={(v) => setFilters({ vehicleType: v === "__all__" ? undefined : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("board.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("board.all")}</SelectItem>
                {VEHICLE_TYPE_VALUES.map((vt) => (
                  <SelectItem key={vt} value={vt}>
                    {tVehicle(vt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("board.filterOrigin")}</Label>
            <Select
              value={query.originLocationId ?? ""}
              onValueChange={(v) =>
                setFilters({ originLocationId: v === "__all__" ? undefined : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("board.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("board.all")}</SelectItem>
                {locationList.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("board.filterDestination")}</Label>
            <Select
              value={query.destinationLocationId ?? ""}
              onValueChange={(v) =>
                setFilters({ destinationLocationId: v === "__all__" ? undefined : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("board.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("board.all")}</SelectItem>
                {locationList.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("board.filterLane")}</Label>
            <Select
              value={query.laneId ?? ""}
              onValueChange={(v) => setFilters({ laneId: v === "__all__" ? undefined : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("board.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("board.all")}</SelectItem>
                {(lanes.data ?? []).map((lane) => (
                  <SelectItem key={lane.id} value={lane.id}>
                    {(codeOf.get(lane.originLocationId) ?? "?")} →{" "}
                    {codeOf.get(lane.destinationLocationId) ?? "?"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pickup-from">{t("board.filterPickupFrom")}</Label>
            <Input
              id="pickup-from"
              type="date"
              value={query.pickupFrom ?? ""}
              onChange={(e) => setFilters({ pickupFrom: e.target.value || undefined })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pickup-to">{t("board.filterPickupTo")}</Label>
            <Input
              id="pickup-to"
              type="date"
              value={query.pickupTo ?? ""}
              onChange={(e) => setFilters({ pickupTo: e.target.value || undefined })}
            />
          </div>
        </div>

        {/* Status multi-select (toggle chips) ---------------------------------------------- */}
        <div className="space-y-1.5">
          <Label>{t("board.filterStatus")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {TRIP_STATUSES.map((status) => {
              const active = statusSet.has(status);
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatus(status)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full transition-opacity",
                    active ? "opacity-100 ring-2 ring-ring ring-offset-1" : "opacity-60 hover:opacity-100",
                  )}
                >
                  <TripStatusBadge status={status} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions: clear + export --------------------------------------------------------- */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            {t("board.clear")}
          </Button>
          <Button asChild type="button" variant="outline" size="sm">
            <a href={exportHref(search)}>{t("board.exportButton")}</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
