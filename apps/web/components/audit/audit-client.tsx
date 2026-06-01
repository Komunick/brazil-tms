"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@brazil-tms/shared";
import { useAuditLog } from "@/lib/trips/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const COLUMN_COUNT = 7;
const PAGE = 50;
const MAX_LIMIT = 200; // mirrors auditLogQuerySchema's max — beyond this the user must narrow filters.

/** §21.5 entity-type presets → the audit `entity_type` values the 001–008 services write. */
const PRESETS = [
  { key: "all", entityType: undefined },
  { key: "trip", entityType: "trip" },
  { key: "exception", entityType: "exception" },
  { key: "document", entityType: "document" },
  { key: "billing", entityType: "billing_item" },
  { key: "export", entityType: "export_batch" },
  { key: "user", entityType: "user" },
] as const;

interface AuditFilters {
  entityType?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
}

function buildSearch(filters: AuditFilters, limit: number): string {
  const params = new URLSearchParams();
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.actorUserId) params.set("actorUserId", filters.actorUserId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("limit", String(limit));
  return params.toString();
}

/** Compact a UUID to its first segment for at-a-glance scanning (full id stays in the title attr). */
function shortId(id: string): string {
  const [head] = id.split("-");
  return head ?? id;
}

/**
 * Audit read view (US4 — EXTENDED by 009). The Admin-only append-only audit trail with §21.5 forensic
 * filters: entity-type presets + actor + date range, paginated (TanStack Query polling, no Realtime).
 * Renders when/action/entity/actor-name/previous/new/reason. Read-only: no mutation UI (FR-019).
 */
export function AuditClient() {
  const t = useTranslations("Audit");
  const tView = useTranslations("AuditView");
  const tPreset = useTranslations("AuditView.presets");
  const tActions = useTranslations("AuditActions");
  const tCommon = useTranslations("Common");

  const [filters, setFilters] = useState<AuditFilters>({});
  const [limit, setLimit] = useState(PAGE);
  const search = useMemo(() => buildSearch(filters, limit), [filters, limit]);

  const { data, isPending, isError } = useAuditLog(search);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const setFilter = (key: keyof AuditFilters, value: string | undefined) => {
    setLimit(PAGE);
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  };

  function snapshot(value: Record<string, unknown> | null): string {
    return value == null ? tCommon("none") : JSON.stringify(value);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Entity-type presets (§21.5 record types). */}
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => {
            const active = (filters.entityType ?? undefined) === p.entityType;
            return (
              <Button
                key={p.key}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => setFilter("entityType", p.entityType)}
                className={cn(!active && "text-muted-foreground")}
              >
                {tPreset(p.key)}
              </Button>
            );
          })}
        </div>

        {/* Actor + date-range filters. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="audit-f-actor" label={tView("actor")}>
            <Input
              id="audit-f-actor"
              value={filters.actorUserId ?? ""}
              placeholder={tView("actorPlaceholder")}
              onChange={(e) => setFilter("actorUserId", e.target.value)}
            />
          </Field>
          <Field id="audit-f-from" label={tView("from")}>
            <Input
              id="audit-f-from"
              type="date"
              value={filters.from ?? ""}
              onChange={(e) => setFilter("from", e.target.value)}
            />
          </Field>
          <Field id="audit-f-to" label={tView("to")}>
            <Input
              id="audit-f-to"
              type="date"
              value={filters.to ?? ""}
              onChange={(e) => setFilter("to", e.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilters({});
                setLimit(PAGE);
              }}
            >
              {tView("clear")}
            </Button>
          </div>
        </div>

        {isError ? (
          <p className="text-sm text-destructive">{t("loadError")}</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("when")}</TableHead>
                  <TableHead>{t("action")}</TableHead>
                  <TableHead>{t("entity")}</TableHead>
                  <TableHead>{t("actor")}</TableHead>
                  <TableHead>{t("previous")}</TableHead>
                  <TableHead>{t("new")}</TableHead>
                  <TableHead>{t("reason")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: COLUMN_COUNT }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={COLUMN_COUNT}
                      className="py-8 text-center text-muted-foreground"
                    >
                      {t("empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(entry.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {tActions(entry.action.replaceAll(".", "_"))}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span>{entry.entityType}</span>{" "}
                        <span
                          className="font-mono text-xs text-muted-foreground"
                          title={entry.entityId}
                        >
                          {shortId(entry.entityId)}
                        </span>
                      </TableCell>
                      <TableCell
                        className="whitespace-nowrap"
                        title={entry.actorUserId}
                      >
                        {entry.actorName ?? shortId(entry.actorUserId)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate font-mono text-xs">
                        {snapshot(entry.previousValue)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate font-mono text-xs">
                        {snapshot(entry.newValue)}
                      </TableCell>
                      <TableCell>{entry.reason ?? tCommon("none")}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {!isPending && total > 0 ? (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{tView("showing", { count: items.length, total })}</span>
                {items.length < total && limit < MAX_LIMIT ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLimit((n) => Math.min(n + PAGE, MAX_LIMIT))}
                  >
                    {tView("loadMore")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}
