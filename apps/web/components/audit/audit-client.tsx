"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { formatDateTime, type AuditAction } from "@brazil-tms/shared";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  actorUserId: string;
  createdAt: string;
  reason: string | null;
}

const COLUMN_COUNT = 7;

async function fetchAuditLogs(): Promise<AuditLog[]> {
  const res = await fetch("/api/admin/audit-logs");
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const body: { entries: AuditLog[] } = await res.json();
  return body.entries;
}

/** Compact a UUID to its first segment for at-a-glance scanning (full id stays in the title attr). */
function shortId(id: string): string {
  const [head] = id.split("-");
  return head ?? id;
}

/**
 * Audit read view table (US4). Fetches the Admin-only audit trail via TanStack Query (polling —
 * no Realtime). Renders when/action/entity/actor/previous/new/reason; loading → skeleton rows,
 * error → a message, empty → a placeholder. Read-only: no mutation UI (append-only, FR-019).
 */
export function AuditClient() {
  const t = useTranslations("Audit");
  const tActions = useTranslations("AuditActions");
  const tCommon = useTranslations("Common");

  const { data, isPending, isError } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: fetchAuditLogs,
  });

  function snapshot(value: Record<string, unknown> | null): string {
    return value == null ? tCommon("none") : JSON.stringify(value);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </CardHeader>
      <CardContent>
        {isError ? (
          <p className="text-sm text-destructive">{t("loadError")}</p>
        ) : (
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
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={COLUMN_COUNT}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {t("empty")}
                  </TableCell>
                </TableRow>
              ) : (
                data.map((entry) => (
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
                      <span className="font-mono text-xs text-muted-foreground" title={entry.entityId}>
                        {shortId(entry.entityId)}
                      </span>
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs text-muted-foreground"
                      title={entry.actorUserId}
                    >
                      {shortId(entry.actorUserId)}
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
        )}
      </CardContent>
    </Card>
  );
}
