"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BILLING_PHASE_STATUSES,
  SLA_STATUSES,
  isTripQueue,
  TRIP_DISPLAY_ORDER,
  VEHICLE_TYPE_VALUES,
  type TripBoardQuery,
  type TripDisplayStatus,
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
import type { TripFilterOptions } from "@brazil-tms/db";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TripStatusBadge } from "@/components/trips/trip-status-badge";
import { exportHref } from "@/lib/trips/client";
import { DEFAULT_TRIP_VIEWS } from "@/lib/trips/views";
import { cn } from "@/lib/utils";

type FilterValue = string | string[] | undefined;

/**
 * Control Tower board filters (feature 005, US1 + US5 export). All filters compose with AND in the
 * read model; each change calls `setFilters`, which resets pagination. The dropdown options
 * (customers/locations/lanes) are loaded server-side by the board page under the `view_all_trips`
 * guard and passed in as `options` — NOT fetched from the `manage_commercial_data`-gated master-data
 * APIs, so the read-only roles 005 serves get populated filters. Lanes carry no display label, so
 * their option label is derived `O → D` from the locations code map. Feature 006 adds the assignment
 * filters (assigned tri-state + assigned driver/vehicle/carrier), sourced from the same server-loaded
 * `options` (now carrying the active fleet lists). Feature 007 adds the SLA-risk filter + the "At
 * risk" view (from `DEFAULT_TRIP_VIEWS`). Feature 018 (issue #25): the three assigned-RESOURCE
 * filters (driver/vehicle/carrier) are searchable comboboxes — type/paste to find; "Todos" is the
 * pinned clear item mapping to the unset (`__all__`) state. The other dropdowns stay plain Selects
 * (clarification 2026-07-27).
 */
export function TripFilters({
  query,
  setFilters,
  reset,
  search,
  options,
  statusCounts,
}: {
  query: TripBoardQuery;
  setFilters: (next: Partial<Record<string, FilterValue>>) => void;
  reset: () => void;
  search: string;
  options: TripFilterOptions;
  /**
   * How many trips each status holds under the CURRENT filters (from the board response, so it moves
   * with them). Undefined on first paint, before the board answers — then every chip is shown, since
   * "no count yet" must never be read as "no trips".
   */
  statusCounts?: Partial<Record<TripDisplayStatus, number>>;
}) {
  const t = useTranslations("Trips");
  const tCommon = useTranslations("Common");
  const tVehicle = useTranslations("VehicleTypes");
  const tSla = useTranslations("Sla.status");
  const tDispatch = useTranslations("Dispatch");

  // Local search box state, synced to the URL `q` param on submit (Enter / blur).
  const [q, setQ] = useState(query.q ?? "");
  useEffect(() => {
    setQ(query.q ?? "");
  }, [query.q]);

  const locationList = options.locations;
  const codeOf = new Map(locationList.map((l) => [l.id, l.code]));

  // A ficha marcada é o status real da URL — MENOS as filas, que se identificam pelo parâmetro
  // próprio delas: as três moram no mesmo `received`, e olhar só o status acenderia as três juntas.
  const statusSet = new Set<TripDisplayStatus>(query.queue ? [query.queue] : (query.status ?? []));

  // With 16 statuses the chip row is long enough that the one you want hides in the middle of the
  // ones you never use. A status with no trips under the current filters is dead weight, so it is
  // folded away behind a counter — unless it is selected (you must always be able to unselect it).
  const [showEmptyStatuses, setShowEmptyStatuses] = useState(false);
  const visibleStatuses = TRIP_DISPLAY_ORDER.filter(
    (status) =>
      showEmptyStatuses ||
      statusCounts === undefined ||
      (statusCounts[status] ?? 0) > 0 ||
      statusSet.has(status),
  );
  const hiddenStatusCount = TRIP_DISPLAY_ORDER.length - visibleStatuses.length;

  /**
   * As três filas do que era "Recebida" são fichas próprias, e ligar uma DESLIGA as outras.
   *
   * Elas compartilham o mesmo status real e se separam por um parâmetro só, que não comporta duas ao
   * mesmo tempo. Isso não é limitação: pedir todas é exatamente pedir "Recebida" inteira, que é o
   * que acontece quando nenhuma está marcada. Ida e volta existem, e nenhum estado fica inalcançável.
   */
  function toggleStatus(status: TripDisplayStatus) {
    if (isTripQueue(status)) {
      const ligando = query.queue !== status;
      setFilters({
        status: ligando ? ["received"] : [],
        queue: ligando ? status : undefined,
      });
      return;
    }
    const next = new Set(statusSet);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    // Sair de uma fila para um status comum solta o recorte da fila junto, senão o quadro fica
    // filtrando por uma coisa que a tela não mostra mais.
    setFilters({ status: Array.from(next).filter((v) => !isTripQueue(v)), queue: undefined });
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

          {/* 006 — assigned tri-state (all / assigned / unassigned → ?assigned unset/true/false) */}
          <div className="space-y-1.5">
            <Label>{t("board.filterAssigned")}</Label>
            <div className="flex gap-1">
              {(
                [
                  { value: undefined, labelKey: "assignedAll" },
                  { value: "true", labelKey: "assignedYes" },
                  { value: "false", labelKey: "assignedNo" },
                ] as const
              ).map((opt) => (
                <Button
                  key={opt.labelKey}
                  type="button"
                  size="sm"
                  variant={(query.assigned ?? undefined) === opt.value ? "default" : "outline"}
                  onClick={() => setFilters({ assigned: opt.value })}
                >
                  {t(`board.${opt.labelKey}`)}
                </Button>
              ))}
            </div>
          </div>

          {/**
           * A fila do despacho, com controle PRÓPRIO (2026-08-18).
           *
           * O filtro nasceu só como atalho do painel, e quem clicava no cartão caía numa lista
           * filtrada sem nada na tela dizendo por quê — nem como voltar. Filtro que não aparece é
           * filtro em que ninguém confia: a pessoa vê 326 linhas onde esperava milhares e conclui
           * que a torre está quebrada.
           *
           * Não é o mesmo que "sem atribuição" ao lado. Aquele pergunta se o TMS tem atribuição;
           * este pergunta se o PORTAL já tem motorista. Por isso vive em botão separado, e não
           * como um quarto estado daquele grupo.
           */}
          <div className="space-y-1.5">
            <Label>{t("board.filterDispatchQueue")}</Label>
            <Button
              type="button"
              size="sm"
              variant={query.awaitingAssignment === "true" ? "default" : "outline"}
              aria-pressed={query.awaitingAssignment === "true"}
              onClick={() =>
                setFilters({
                  awaitingAssignment: query.awaitingAssignment === "true" ? undefined : "true",
                })
              }
            >
              {t("board.awaitingAssignment")}
            </Button>
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
                {options.customers.map((c) => (
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

          {/* 007 — SLA-risk filter. Picking a specific status clears the broad `atRisk` shorthand so
              they never compose to an empty board (atRisk = at_risk|late|breached). */}
          <div className="space-y-1.5">
            <Label>{t("board.filterSlaStatus")}</Label>
            <Select
              value={query.slaStatus?.[0] ?? ""}
              onValueChange={(v) =>
                setFilters({ slaStatus: v === "__all__" ? [] : [v], atRisk: undefined })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("board.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("board.all")}</SelectItem>
                {SLA_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {tSla(s)}
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
                {options.lanes.map((lane) => (
                  <SelectItem key={lane.id} value={lane.id}>
                    {codeOf.get(lane.originLocationId) ?? "?"} →{" "}
                    {codeOf.get(lane.destinationLocationId) ?? "?"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 006 — assigned-resource filters (server-loaded active fleet lists); 018 — searchable
              comboboxes (type/paste to find; "Todos" = pinned clear item → unset). */}
          <div className="space-y-1.5">
            <Label htmlFor="filter-driver">{t("board.filterDriver")}</Label>
            <SearchableSelect
              id="filter-driver"
              value={query.driverId ?? ""}
              options={options.drivers}
              onChange={(v) => setFilters({ driverId: v || undefined })}
              placeholder={t("board.all")}
              emptyText={tDispatch("searchNoResults")}
              clearable
              clearLabel={t("board.all")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-vehicle">{t("board.filterVehicle")}</Label>
            <SearchableSelect
              id="filter-vehicle"
              value={query.vehicleId ?? ""}
              options={options.vehicles}
              onChange={(v) => setFilters({ vehicleId: v || undefined })}
              placeholder={t("board.all")}
              emptyText={tDispatch("searchNoResults")}
              mode="plate"
              clearable
              clearLabel={t("board.all")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-carrier">{t("board.filterCarrier")}</Label>
            <SearchableSelect
              id="filter-carrier"
              value={query.carrierId ?? ""}
              options={options.carriers}
              onChange={(v) => setFilters({ carrierId: v || undefined })}
              placeholder={t("board.all")}
              emptyText={tDispatch("searchNoResults")}
              clearable
              clearLabel={t("board.all")}
            />
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
          <div className="flex flex-wrap items-center gap-1.5">
            {visibleStatuses.map((status) => {
              const active = statusSet.has(status);
              const chipCount = statusCounts?.[status];
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatus(status)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-1 rounded-full transition-opacity",
                    active
                      ? "opacity-100 ring-2 ring-ring ring-offset-1"
                      : "opacity-60 hover:opacity-100",
                  )}
                >
                  <TripStatusBadge status={status} />
                  {chipCount === undefined ? null : (
                    <span className="pr-1 text-xs tabular-nums text-muted-foreground">
                      {chipCount}
                    </span>
                  )}
                </button>
              );
            })}
            {/* An empty status is hidden, not deleted: the count is a fact about the current filters,
                not about the machine, so the operator can always bring the rest back. */}
            {hiddenStatusCount > 0 || showEmptyStatuses ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setShowEmptyStatuses((prev) => !prev)}
              >
                {showEmptyStatuses
                  ? t("board.filterStatusEmptyHide")
                  : t("board.filterStatusEmptyShow", { count: hiddenStatusCount })}
              </Button>
            ) : null}
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
