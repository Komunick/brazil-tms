"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// --- Shapes (mirror contracts/bff-endpoints.md `ImportBatchSummary`) ----------------------------

type ImportBatchStatus =
  | "received"
  | "parsing"
  | "validating"
  | "validated"
  | "confirming"
  | "completed"
  | "failed";

interface ImportBatchSummary {
  id: string;
  customerId: string;
  fileName: string;
  status: ImportBatchStatus;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  duplicateCount: number;
  errorCount: number;
  uploadedBy: string;
  createdAt: string; // ISO UTC
  hasErrorReport: boolean;
  /** Which import produced this row: the spreadsheet path, or one of the two portal exports. */
  source: string;
  summary: PortalSummary | null;
}

/**
 * What a PORTAL import recorded — the part the five count columns cannot hold. A portal import is
 * described by its own words: "criadas / atualizadas / duplicadas / erros" says nothing about legs
 * that were already ahead, or about a station nobody has registered yet.
 */
interface PortalSummary {
  mode?: "plan" | "execution";
  trips?: number;
  legs?: number;
  plan?: {
    created: number;
    updated: number;
    unchanged: number;
    cancelled: number;
    failed: number;
    milestones: number;
  } | null;
  execution?: {
    applied: number;
    notFound: number;
    alreadyAhead: number;
    noMilestones: number;
    closed: number;
  } | null;
  unknownStations?: string[];
}

interface CustomerOption {
  id: string;
  name: string;
  customerCode: string;
}

// --- Fetch helpers ------------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`REQUEST_FAILED:${res.status}`);
  return (await res.json()) as T;
}

function statusBadgeVariant(
  status: ImportBatchStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "failed") return "destructive";
  if (status === "validated") return "secondary";
  return "outline";
}

// `pt-BR`/`America/Sao_Paulo` display of a UTC ISO timestamp (stored UTC, shown local — CLAUDE.md).
const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMATTER.format(date);
}

export function ImportHistoryClient() {
  const t = useTranslations("Imports");

  const historyQuery = useQuery({
    queryKey: ["import-history"],
    queryFn: () =>
      fetchJson<{ items: ImportBatchSummary[] }>("/api/imports?limit=50").then((b) => b.items),
    staleTime: 10_000,
  });

  // Resolve customerId → name (reuse the shared master-data query key/cache).
  const customersQuery = useQuery({
    queryKey: ["master-data", "customers"],
    queryFn: () =>
      fetchJson<{ items: CustomerOption[] }>("/api/master-data/customers").then((b) => b.items),
    staleTime: 30_000,
  });

  const customerName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customersQuery.data ?? []) map.set(c.id, c.name);
    return (id: string) => map.get(id) ?? id;
  }, [customersQuery.data]);

  const rows = historyQuery.data ?? [];

  const columns: ColumnDef<ImportBatchSummary>[] = [
    {
      accessorKey: "fileName",
      header: () => t("historyFileName"),
      cell: ({ row }) => <span className="font-medium">{row.original.fileName}</span>,
    },
    {
      accessorKey: "source",
      header: () => t("historySource"),
      cell: ({ row }) => (
        <Badge variant="outline">
          {t(`source.${row.original.source}` as "source.spreadsheet")}
        </Badge>
      ),
    },
    {
      accessorKey: "customerId",
      header: () => t("customer"),
      cell: ({ row }) => customerName(row.original.customerId),
    },
    {
      accessorKey: "createdAt",
      header: () => t("historyTime"),
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: "_counts",
      header: () => t("historyCounts"),
      // Each import speaks its own vocabulary: an execution import that "applied 8" has nothing to
      // say about duplicates, and a plan import's "unchanged" is not an error.
      cell: ({ row }) => {
        const detail = row.original.summary;
        if (detail?.execution) {
          return (
            <span className="text-sm text-muted-foreground">
              {t("summaryExecution", {
                applied: detail.execution.applied,
                notFound: detail.execution.notFound,
                ahead: detail.execution.alreadyAhead,
              })}
            </span>
          );
        }
        if (detail?.plan) {
          return (
            <span className="text-sm text-muted-foreground">
              {t("summaryPlan", {
                created: detail.plan.created,
                updated: detail.plan.updated,
                unchanged: detail.plan.unchanged,
                cancelled: detail.plan.cancelled,
              })}
            </span>
          );
        }
        return (
          <span className="text-sm text-muted-foreground">
            {t("summary", {
              created: row.original.createdCount,
              updated: row.original.updatedCount,
              duplicate: row.original.duplicateCount,
              error: row.original.errorCount,
            })}
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: () => t("historyStatus"),
      cell: ({ row }) => (
        <Badge variant={statusBadgeVariant(row.original.status)}>
          {t(`status.${row.original.status}`)}
        </Badge>
      ),
    },
    {
      id: "_actions",
      header: () => t("historyErrors"),
      // Show the download only when a report actually exists in Storage (hasErrorReport), not merely
      // when errorCount > 0 — otherwise the link would 404. It is a plain navigation to the endpoint
      // (which 302-redirects to a fresh signed URL), so no fetch + window.open (popup-block safe).
      //
      // A portal import has no error report; what it has is a list of stations nobody registered,
      // which is the one thing an operator must act on — so it is shown here in the report's place.
      cell: ({ row }) => {
        const stations = row.original.summary?.unknownStations ?? [];
        if (stations.length > 0) {
          return (
            <span className="text-xs text-destructive" title={stations.join("\n")}>
              {t("historyUnknownStations", { count: stations.length })}
            </span>
          );
        }
        return row.original.hasErrorReport ? (
          <Button asChild size="sm" variant="outline">
            <a
              href={`/api/imports/${row.original.id}/error-report`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("historyDownloadErrors")}
            </a>
          </Button>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
  ];

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const columnCount = columns.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("historyTitle")}</h1>
          <p className="text-muted-foreground">{t("historySubtitle")}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/imports">{t("backToImport")}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("historyTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {historyQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {t("historyLoadError")}
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
                {historyQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={columnCount}>{t("historyLoading")}</TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columnCount} className="text-muted-foreground">
                      {t("historyEmpty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
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
        </CardContent>
      </Card>
    </div>
  );
}
