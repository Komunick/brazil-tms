"use client";

import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Execution import card on /imports (2026-08-16).
 *
 * The two cards above it bring in a PLAN — trips to run, resources to run them. This one brings in
 * what already happened: the customer's portal export, whose `ATA`/`ATD` columns are the only place
 * the real arrival and departure times have ever existed. Applying it is what lets the trip timeline
 * stop being a list of things people declared.
 *
 * Separate card, separate act: it is gated by `import_trips`, applies synchronously (so the summary
 * IS the outcome, with no batch to confirm), and NEVER creates a trip — legs whose trip the TMS does
 * not have are counted and reported rather than invented, which is why the result panel leads with
 * what was applied and follows with what was not.
 */

interface PortalResult {
  fileName: string;
  rows: number;
  trips: number;
  legs: number;
  summary: {
    applied: number;
    notFound: number;
    alreadyAhead: number;
    noMilestones: number;
    unknownStation: number;
    closed: number;
  };
  rejected: { row: number; externalTripId: string; reason: string }[];
  unknownStations: string[];
}

export function PortalExecutionCard() {
  const t = useTranslations("PortalImport");
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PortalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: async (chosen: File): Promise<PortalResult> => {
      const body = new FormData();
      body.append("file", chosen);
      const res = await fetch("/api/imports/portal-execution", { method: "POST", body });
      const json = (await res.json().catch(() => null)) as {
        result?: PortalResult;
        error?: { message?: string };
      } | null;
      if (!res.ok || !json?.result) {
        throw new Error(json?.error?.message ?? t("genericError"));
      }
      return json.result;
    },
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      // Trips just moved and gained events: the boards should show it the moment they are opened.
      void queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
    onError: (e: Error) => {
      setError(e.message);
      setResult(null);
    },
  });

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    if (file) upload.mutate(file);
  }

  const summary = result?.summary;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[18rem] flex-1 space-y-1.5">
            <Label htmlFor="portal-file">{t("fileLabel")}</Label>
            <Input
              id="portal-file"
              ref={inputRef}
              type="file"
              accept=".csv"
              disabled={upload.isPending}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button type="submit" disabled={!file || upload.isPending}>
            {upload.isPending ? t("importing") : t("import")}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground">{t("hint")}</p>

        {upload.isPending ? (
          <div className="space-y-2 rounded-md border p-4" aria-busy="true">
            <p className="text-sm font-medium">{t("importing")}</p>
            <p className="text-xs text-muted-foreground">{t("importingHint")}</p>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {result && summary ? (
          <div className="space-y-3">
            {/* What it DID, first and alone: everything else on this panel is a reason it did not. */}
            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">{t("applied", { count: summary.applied })}</p>
              <p className="text-xs text-muted-foreground">
                {t("readSummary", {
                  rows: result.rows,
                  trips: result.trips,
                  legs: result.legs,
                })}
              </p>
            </div>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Untouched label={t("notFound")} value={summary.notFound} hint={t("notFoundHint")} />
              <Untouched label={t("closed")} value={summary.closed} hint={t("closedHint")} />
              <Untouched
                label={t("alreadyAhead")}
                value={summary.alreadyAhead}
                hint={t("alreadyAheadHint")}
              />
              <Untouched
                label={t("noMilestones")}
                value={summary.noMilestones}
                hint={t("noMilestonesHint")}
              />
            </dl>

            {result.unknownStations.length > 0 ? (
              <div className="rounded-md border border-destructive/40 p-3">
                <p className="text-sm font-medium text-destructive">
                  {t("unknownStations", { count: result.unknownStations.length })}
                </p>
                <p className="text-xs text-muted-foreground">{t("unknownStationsHint")}</p>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {result.unknownStations.map((station) => (
                    <li key={station}>{station}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result.rejected.length > 0 ? (
              <div className="rounded-md border p-3">
                <p className="text-sm font-medium">
                  {t("rejected", { count: result.rejected.length })}
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {result.rejected.slice(0, 10).map((r) => (
                    <li key={`${r.row}-${r.externalTripId}`}>
                      {t("rejectedRow", { row: r.row, id: r.externalTripId })} — {r.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** One count of legs the import deliberately left alone, with the reason under it. */
function Untouched({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-md border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
