"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

/**
 * Registry import card on /imports (issue: "um botão que faça esse tipo de importação").
 *
 * Separate from the trip import right above it because it is a different act on different data:
 * this one loads the FLEET REGISTRY (drivers, vehicles, trailers) from the MOTORISTAS and
 * VEÍCULOSCARRETAS tabs, is gated by `manage_fleet_data`, and applies in one synchronous request —
 * so the summary shown IS the outcome, with no batch to confirm afterwards.
 *
 * Re-uploading a corrected workbook is the expected flow (the file is re-exported by hand every
 * week), so the copy says so: it updates in place and never duplicates.
 */

interface EntityCount {
  created: number;
  updated: number;
  unchanged: number;
}

interface RegistryWarning {
  entity: "drivers" | "vehicles" | "trailers";
  code: string;
  row: number;
  detail: string;
}

interface RegistryResult {
  drivers: EntityCount;
  vehicles: EntityCount;
  trailers: EntityCount;
  warnings: RegistryWarning[];
  missingSheets: string[];
}

const ENTITY_HREF: Record<RegistryWarning["entity"], string> = {
  drivers: "/resources/drivers",
  vehicles: "/resources/vehicles",
  trailers: "/resources/trailers",
};

export function RegistryImportCard() {
  const t = useTranslations("RegistryImport");
  const tCommon = useTranslations("Common");
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<RegistryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: async (chosen: File): Promise<RegistryResult> => {
      const body = new FormData();
      body.append("file", chosen);
      const res = await fetch("/api/imports/registry", { method: "POST", body });
      const json = (await res.json().catch(() => null)) as {
        result?: RegistryResult;
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
      // The fleet screens poll, but invalidating makes the new rows appear the moment you open them.
      void queryClient.invalidateQueries({ queryKey: ["master-data"] });
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

  const entities = ["drivers", "vehicles", "trailers"] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[18rem] flex-1 space-y-1.5">
            <Label htmlFor="registry-file">{t("fileLabel")}</Label>
            <Input
              id="registry-file"
              ref={inputRef}
              type="file"
              accept=".xlsx"
              disabled={upload.isPending}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button type="submit" disabled={!file || upload.isPending}>
            {upload.isPending ? t("importing") : t("import")}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground">{t("mappingHint")}</p>

        {upload.isPending ? (
          <div className="space-y-2 rounded-md border p-4" aria-busy="true">
            <p className="text-sm font-medium">{t("importing")}</p>
            <p className="text-xs text-muted-foreground">{t("importingHint")}</p>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {entities.map((entity) => (
                <div key={entity} className="rounded-md border p-3">
                  <Link
                    href={ENTITY_HREF[entity]}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {t(`entity.${entity}`)}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("counts", {
                      created: result[entity].created,
                      updated: result[entity].updated,
                      unchanged: result[entity].unchanged,
                    })}
                  </p>
                </div>
              ))}
            </div>

            {result.missingSheets.length ? (
              <p className="text-sm text-muted-foreground">
                {t("missingSheets", { sheets: result.missingSheets.join(", ") })}
              </p>
            ) : null}

            {result.warnings.length ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {t("warnings", { count: result.warnings.length })}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{t("warningsHint")}</span>
                </div>
                <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-3 text-sm">
                  {result.warnings.map((w, i) => (
                    <li key={`${w.entity}-${w.row}-${i}`} className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {t(`entity.${w.entity}`)} · {t("row", { row: w.row })}
                      </span>{" "}
                      {w.detail}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{tCommon("none")}</p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
