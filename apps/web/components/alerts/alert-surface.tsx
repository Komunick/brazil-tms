"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@brazil-tms/shared";
import {
  TripsError,
  useAcknowledgeAlert,
  useAlerts,
  useUnacknowledgeAlert,
} from "@/lib/trips/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * In-app alert surface (007, US4). Lists the open §17 alerts (newest-first) with an acknowledge
 * action; the acknowledged ones are behind a toggle (2026-08-15), greyed, naming who silenced each
 * and when, and undoable. Mounted on the Control-Tower board + Home Dashboard; polled on the
 * control-tower cadence. In-app only — nothing leaves the app (FR-025). pt-BR.
 */

const SEVERITY_CLASS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-100 text-amber-900",
  high: "bg-destructive/15 text-destructive",
};

export function AlertSurface() {
  const t = useTranslations("Alerts");
  /**
   * The surface leads with the ACTIVE alerts: acknowledging silences one until its condition clears,
   * so keeping it in the working list would defeat the point (D3). But acknowledging used to make it
   * vanish with no trace anywhere in the app — a one-way door, with no way to check what the team had
   * already triaged and no way back from a misclick. The acknowledged ones are now one click away,
   * greyed, each naming who silenced it and when, each undoable.
   */
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const query = useAlerts(showAcknowledged ? {} : { state: "active" });
  const acknowledge = useAcknowledgeAlert();
  const unacknowledge = useUnacknowledgeAlert();

  const items = query.data?.items ?? [];
  // Active first, then the silenced ones — the working list must not be pushed down the page by
  // rows that are, by definition, already handled.
  const sorted = [...items].sort(
    (a, b) => Number(a.state === "acknowledged") - Number(b.state === "acknowledged"),
  );
  const activeCount = items.filter((a) => a.state === "active").length;
  const acknowledgedCount = items.length - activeCount;

  const mapError = (e: unknown): string => {
    const code = e instanceof TripsError ? e.code : "REQUEST_FAILED";
    try {
      return t(`errors.${code}` as Parameters<typeof t>[0]);
    } catch {
      return t("errors.REQUEST_FAILED");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("surfaceTitle")}</CardTitle>
        <div className="flex items-center gap-3">
          {/* The number always counts the ACTIVE ones, toggle or no toggle: it is the size of the
              pile still owed attention, and it must not grow when you ask to see the handled ones. */}
          <span className="text-sm text-muted-foreground tabular-nums">{activeCount}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAcknowledged((current) => !current)}
          >
            {/* The count only appears while they are shown: with the list filtered to active, the
                app genuinely does not know how many silenced ones are behind the toggle. */}
            {showAcknowledged
              ? t("hideAcknowledged", { count: acknowledgedCount })
              : t("showAcknowledged")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : query.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t("loadError")}
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {showAcknowledged ? t("emptyIncludingAcknowledged") : t("empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((a) => (
              <li
                key={a.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm ${
                  a.state === "acknowledged" ? "bg-muted/40 text-muted-foreground" : ""
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      SEVERITY_CLASS[a.severity] ?? ""
                    }`}
                  >
                    {t(`caseValue.${a.alertCase}` as Parameters<typeof t>[0])}
                  </span>
                  <Link
                    href={`/trips/${a.tripId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {a.externalTripId ?? a.tripId.slice(0, 8)}
                  </Link>
                  {a.customerName ? (
                    <span className="text-muted-foreground">· {a.customerName}</span>
                  ) : null}
                  <span className="text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                </div>
                {a.state === "acknowledged" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs">
                      {a.acknowledgedByName
                        ? t("acknowledgedByAt", {
                            name: a.acknowledgedByName,
                            at: formatDateTime(a.acknowledgedAt),
                          })
                        : t("acknowledged")}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={unacknowledge.isPending}
                      onClick={() =>
                        unacknowledge.mutate(a.id, {
                          onError: (e) => {
                            console.error(mapError(e));
                          },
                        })
                      }
                    >
                      {t("undoAcknowledge")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acknowledge.isPending}
                    onClick={() =>
                      acknowledge.mutate(a.id, {
                        onError: (e) => {
                          // Surface a transient error inline via the row title attribute.
                          console.error(mapError(e));
                        },
                      })
                    }
                  >
                    {t("acknowledge")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
