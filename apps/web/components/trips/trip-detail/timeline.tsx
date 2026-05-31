import { useTranslations } from "next-intl";
import { formatDateTime, TRIP_STATUSES, type TripStatus } from "@brazil-tms/shared";
import type { TripDetailView } from "@brazil-tms/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Read-only event timeline (005 US2): the trip's lifecycle events newest-first. Presentational
 * (isomorphic `useTranslations`, no `"use client"`). Status labels reuse `Trips.status`; event-type
 * and source strings are shown raw (no dedicated i18n namespace in the 005 key set).
 */
export function TimelineSection({ events }: { events: TripDetailView["events"] }) {
  const t = useTranslations("Trips.detail");
  const tStatus = useTranslations("Trips.status");

  // Newest first — sort by timestamp (fallback to createdAt), descending.
  const ordered = [...events].sort((a, b) => {
    const at = a.eventTimestamp ?? a.createdAt;
    const bt = b.eventTimestamp ?? b.createdAt;
    return bt.localeCompare(at);
  });

  const statusLabel = (s: string | null) => {
    if (!s) return "—";
    return (TRIP_STATUSES as readonly string[]).includes(s) ? tStatus(s as TripStatus) : s;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sectionTimeline")}</CardTitle>
      </CardHeader>
      <CardContent>
        {ordered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("timelineEmpty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("auditWhen")}</TableHead>
                <TableHead>{t("sectionTimeline")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("sectionNotes")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(ev.eventTimestamp ?? ev.createdAt)}
                  </TableCell>
                  <TableCell>{ev.eventType}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {ev.statusBefore || ev.statusAfter
                      ? `${statusLabel(ev.statusBefore)} → ${statusLabel(ev.statusAfter)}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{ev.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
