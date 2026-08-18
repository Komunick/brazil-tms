"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Reusable master-data list (feature 002 — justified by 7 immediate consumers, Constitution I / ≥3
 * rule). Owns the cross-entity concerns: text search, an "incluir arquivados" toggle, the archived
 * badge, a row→detail link, and an archive action gated by `delete_archive` (passed as `canArchive`).
 * Entity screens supply only their TanStack Table `columns`; this component appends the shared
 * status + actions columns. Freshness is the caller's TanStack Query polling — never Realtime.
 */

/** Rows rendered per page. A real fleet registry is ~1k rows; rendering it whole froze the screen. */
const PAGE_SIZE = 50;

export interface MasterDataRow {
  id: string;
  archived: boolean;
}

export interface MasterDataTableProps<T extends MasterDataRow> {
  rows: T[];
  columns: ColumnDef<T>[];
  isLoading: boolean;
  isError: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  includeArchived: boolean;
  onIncludeArchivedChange: (value: boolean) => void;
  /** Detail/edit route for a row (the row's "Abrir" link). */
  detailHref: (row: T) => string;
  /** Admin-only (delete_archive). When false, the archive action is hidden. */
  canArchive: boolean;
  onArchive?: (row: T) => void;
  archivingId?: string | null;
}

export function MasterDataTable<T extends MasterDataRow>({
  rows,
  columns,
  isLoading,
  isError,
  search,
  onSearchChange,
  searchPlaceholder,
  includeArchived,
  onIncludeArchivedChange,
  detailHref,
  canArchive,
  onArchive,
  archivingId,
}: MasterDataTableProps<T>) {
  const t = useTranslations("MasterData");
  const tCommon = useTranslations("Common");
  // Same pagination wording as the trip boards — one vocabulary across every list in the product.
  const tBoard = useTranslations("Trips.board");

  const allColumns: ColumnDef<T>[] = [
    ...columns,
    {
      id: "_status",
      header: () => t("statusColumn"),
      cell: ({ row }) =>
        row.original.archived ? (
          <Badge variant="outline">{t("archived")}</Badge>
        ) : (
          <Badge variant="default">{t("active")}</Badge>
        ),
    },
    {
      id: "_actions",
      header: () => tCommon("actions"),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={detailHref(row.original)}>{tCommon("edit")}</Link>
          </Button>
          {canArchive && !row.original.archived && onArchive ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={archivingId === row.original.id}
              onClick={() => onArchive(row.original)}
            >
              {t("archive")}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: rows,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    // Paged in the browser: these endpoints return the whole (small) registry in one request, and a
    // real fleet is ~1k rows — rendering all of them at once left the screen on "Carregando…" for
    // seconds. Paging the RENDER keeps the list instant without touching the API contract.
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });

  // Searching/toggling archived shrinks the data under the current page — go back to the first one
  // so a filter never lands on a page that no longer exists (blank list, looks broken).
  useEffect(() => {
    table.setPageIndex(0);
  }, [search, includeArchived, table]);

  const columnCount = allColumns.length;
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;
  const firstShown = rows.length === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const lastShown = Math.min((pageIndex + 1) * PAGE_SIZE, rows.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="max-w-sm flex-1">
          <Input
            type="search"
            placeholder={searchPlaceholder ?? tCommon("search")}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label={tCommon("search")}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={includeArchived}
            onChange={(e) => onIncludeArchivedChange(e.target.checked)}
          />
          {t("includeArchived")}
        </label>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("loadError")}
        </p>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columnCount}>{tCommon("loading")}</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-archived={row.original.archived}>
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

      {/* Pagination footer — same wording as the trip boards. Hidden when everything fits one page. */}
      {rows.length > PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {tBoard("paginationSummary", {
              from: firstShown,
              to: lastShown,
              total: rows.length,
            })}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              {tBoard("previous")}
            </Button>
            <span className="self-center">
              {pageIndex + 1}/{pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              {tBoard("next")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
