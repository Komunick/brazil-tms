"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import {
  formatDateTime,
  VEHICLE_TYPE_VALUES,
  type TripBoardQuery,
  type VehicleType,
} from "@brazil-tms/shared";
import type { TripBoardRow, TripFilterOptions } from "@brazil-tms/db";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TripStatusBadge } from "@/components/trips/trip-status-badge";
import { TripFilters } from "@/components/trips/trip-filters";
import { useTripBoard, useTripBoardFilters } from "@/lib/trips/client";

/** Board `sort` values that map to a column header (R2 whitelist). */
type SortKey = TripBoardQuery["sort"];

/**
 * The Control Tower board (feature 005, US1): filters + a dense server-side
 * filtered/sorted/paginated TanStack Table + a pagination footer. URL is the source of truth
 * (`useTripBoardFilters`); data freshness is TanStack Query polling (`useTripBoard`), never
 * Realtime. Each row links to the Trip Detail page. Only the five whitelisted columns are sortable;
 * later-slice dimensions (assignment → 006, SLA risk → 007, documents/billing detail → 008) are not
 * rendered as filterable/sortable columns here.
 */
export function ControlTowerTable({ filterOptions }: { filterOptions: TripFilterOptions }) {
  const t = useTranslations("Trips");
  const tCommon = useTranslations("Common");
  const tVehicle = useTranslations("VehicleTypes");
  const { query, search, setFilters, reset } = useTripBoardFilters();

  /** Label a (possibly unknown) vehicle-type string via the `VehicleTypes` namespace; "—" if absent. */
  function vehicleLabel(vt: string | null): string {
    if (vt && (VEHICLE_TYPE_VALUES as readonly string[]).includes(vt)) {
      return tVehicle(vt as VehicleType);
    }
    return "—";
  }
  const board = useTripBoard(search);

  const items = board.data?.items ?? [];
  const total = board.data?.total ?? 0;
  const limit = query.limit;
  const offset = query.offset;

  function toggleSort(key: SortKey) {
    if (query.sort === key) {
      setFilters({ sort: key, dir: query.dir === "asc" ? "desc" : "asc" });
    } else {
      setFilters({ sort: key, dir: "asc" });
    }
  }

  /** A clickable, sortable column header with an asc/desc/neutral indicator. */
  function SortableHeader({ label, sortKey }: { label: string; sortKey: SortKey }) {
    const active = query.sort === sortKey;
    const Icon = !active ? ArrowUpDown : query.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
        onClick={() => toggleSort(sortKey)}
        aria-label={label}
      >
        {label}
        <Icon className={active ? "h-3.5 w-3.5" : "h-3.5 w-3.5 opacity-40"} aria-hidden />
      </button>
    );
  }

  const columns: ColumnDef<TripBoardRow>[] = [
    {
      id: "externalTripId",
      header: () => t("board.colExternalId"),
      cell: ({ row }) => (
        <Link href={`/trips/${row.original.id}`} className="font-medium text-primary hover:underline">
          {row.original.externalTripId ?? "—"}
        </Link>
      ),
    },
    {
      id: "customerName",
      header: () => <SortableHeader label={t("board.colCustomer")} sortKey="customer" />,
      cell: ({ row }) => row.original.customerName || "—",
    },
    {
      id: "origin",
      header: () => t("board.colOrigin"),
      cell: ({ row }) => (
        <span title={row.original.originName}>{row.original.originCode || "—"}</span>
      ),
    },
    {
      id: "destination",
      header: () => t("board.colDestination"),
      cell: ({ row }) => (
        <span title={row.original.destinationName}>{row.original.destinationCode || "—"}</span>
      ),
    },
    {
      id: "laneLabel",
      header: () => t("board.colLane"),
      cell: ({ row }) => row.original.laneLabel ?? "—",
    },
    {
      id: "status",
      header: () => <SortableHeader label={t("board.colStatus")} sortKey="status" />,
      cell: ({ row }) => <TripStatusBadge status={row.original.currentStatus} />,
    },
    {
      id: "billing",
      header: () => t("board.colBilling"),
      cell: ({ row }) => t(`billingStatus.${row.original.billingStatus ?? "none"}`),
    },
    {
      id: "plannedPickup",
      header: () => <SortableHeader label={t("board.colPickup")} sortKey="pickupStart" />,
      cell: ({ row }) => formatDateTime(row.original.plannedPickupWindowStart),
    },
    {
      id: "plannedDelivery",
      header: () => t("board.colDelivery"),
      cell: ({ row }) => formatDateTime(row.original.plannedDeliveryWindowStart),
    },
    {
      id: "plannedVehicleType",
      header: () => t("board.colVehicleType"),
      cell: ({ row }) => vehicleLabel(row.original.plannedVehicleType),
    },
    {
      id: "updatedAt",
      header: () => <SortableHeader label={t("board.colUpdatedAt")} sortKey="updatedAt" />,
      cell: ({ row }) => formatDateTime(row.original.updatedAt),
    },
  ];

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const columnCount = columns.length;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <div className="space-y-4">
      <TripFilters
        query={query}
        setFilters={setFilters}
        reset={reset}
        search={search}
        options={filterOptions}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {board.isLoading ? (
              <TableRow>
                <TableCell colSpan={columnCount}>{tCommon("loading")}</TableCell>
              </TableRow>
            ) : board.isError ? (
              <TableRow>
                <TableCell colSpan={columnCount} role="alert" className="text-destructive">
                  {t("board.loadError")}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-muted-foreground">
                  {t("board.empty")}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="whitespace-nowrap">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination footer ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{t("board.paginationSummary", { from, to, total })}</span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canPrev}
            onClick={() => setFilters({ offset: String(Math.max(0, offset - limit)) })}
          >
            {t("board.previous")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canNext}
            onClick={() => setFilters({ offset: String(offset + limit) })}
          >
            {t("board.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
