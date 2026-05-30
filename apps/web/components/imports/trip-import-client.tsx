"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// --- Shapes (mirror contracts/bff-endpoints.md "Shared returned shapes") -------------------------

type ImportBatchStatus =
  | "received"
  | "parsing"
  | "validating"
  | "validated"
  | "confirming"
  | "completed"
  | "failed";

type RowOutcome = "valid" | "warning" | "error" | null;

type MatchDecision =
  | "new"
  | "update"
  | "no_op"
  | "potential_duplicate"
  | "unresolved"
  | null;

interface CustomerOption {
  id: string;
  name: string;
  customerCode: string;
}

interface ImportTemplate {
  id: string;
  customerId: string;
  name: string;
  version: number;
  active: boolean;
  archived: boolean;
}

interface ImportBatchDetail {
  id: string;
  customerId: string;
  fileName: string;
  status: ImportBatchStatus;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  duplicateCount: number;
  errorCount: number;
  templateId: string | null;
  hasErrorReport: boolean;
  errorMessage: string | null;
}

interface ImportRow {
  rowNumber: number;
  outcome: RowOutcome;
  matchDecision: MatchDecision;
  reasons: { code: string; field?: string; message: string }[];
  mapped: Record<string, unknown> | null;
  targetTripId: string | null;
}

// --- Fetch helpers ------------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`REQUEST_FAILED:${res.status}`);
  return (await res.json()) as T;
}

const TERMINAL_STATUSES: ReadonlySet<ImportBatchStatus> = new Set([
  "validated",
  "completed",
  "failed",
]);

function statusBadgeVariant(
  status: ImportBatchStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "failed") return "destructive";
  if (status === "validated") return "secondary";
  return "outline";
}

function outcomeBadgeClass(outcome: RowOutcome): string {
  if (outcome === "valid") return "border-transparent bg-green-600 text-white";
  if (outcome === "warning") return "border-transparent bg-amber-500 text-white";
  if (outcome === "error") return "border-transparent bg-red-600 text-white";
  return "";
}

export function TripImportClient() {
  const t = useTranslations("Imports");
  const queryClient = useQueryClient();

  const [customerId, setCustomerId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // 1. Customers (reuse the master-data query key, same endpoint).
  const customersQuery = useQuery({
    queryKey: ["master-data", "customers"],
    queryFn: () =>
      fetchJson<{ items: CustomerOption[] }>("/api/master-data/customers").then(
        (b) => b.items,
      ),
    staleTime: 30_000,
  });

  // 2. Templates for the selected customer (active only).
  const templatesQuery = useQuery({
    queryKey: ["import-templates", customerId],
    queryFn: () =>
      fetchJson<{ items: ImportTemplate[] }>(
        `/api/import-templates?customerId=${encodeURIComponent(customerId)}`,
      ).then((b) => b.items.filter((tpl) => tpl.active && !tpl.archived)),
    enabled: Boolean(customerId),
    staleTime: 30_000,
  });

  // 4. Batch progress — polled until a terminal status (NO Realtime).
  const batchQuery = useQuery({
    queryKey: ["import-batch", batchId],
    queryFn: () =>
      fetchJson<{ item: ImportBatchDetail }>(
        `/api/imports/${batchId}`,
      ).then((b) => b.item),
    enabled: Boolean(batchId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return 2500;
      // Stop polling once the batch reaches a terminal/awaiting-user state (validated → preview is
      // ready; completed/failed → done). Confirm resumes polling via query invalidation.
      if (TERMINAL_STATUSES.has(status)) return false;
      return 2500;
    },
  });

  const batch = batchQuery.data;
  const status = batch?.status;
  const isValidatedOrLater =
    status === "validated" || status === "confirming" || status === "completed";

  // 5. Preview rows — once validation has produced outcomes.
  const rowsQuery = useQuery({
    queryKey: ["import-rows", batchId],
    queryFn: () =>
      fetchJson<{ items: ImportRow[]; total: number }>(
        `/api/imports/${batchId}/rows?limit=200`,
      ),
    enabled: Boolean(batchId) && isValidatedOrLater,
    staleTime: 5_000,
  });

  // 3. Upload mutation → 202 { id }.
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("NO_FILE");
      const form = new FormData();
      form.append("file", file);
      form.append("customerId", customerId);
      if (templateId) form.append("templateId", templateId);
      const res = await fetch("/api/imports", { method: "POST", body: form });
      if (!res.ok) throw new Error(`UPLOAD_FAILED:${res.status}`);
      return (await res.json()) as { id: string };
    },
    onSuccess: ({ id }) => {
      setUploadError(null);
      setBatchId(id);
    },
    onError: () => setUploadError(t("uploadError")),
  });

  // 6. Confirm mutation → 202; resume polling until completed.
  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/imports/${batchId}/confirm`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`CONFIRM_FAILED:${res.status}`);
      return (await res.json()) as { id: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["import-batch", batchId] });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customerId || !file) return;
    uploadMutation.mutate();
  }

  function resetForNewImport() {
    setBatchId(null);
    setFile(null);
    setUploadError(null);
    confirmMutation.reset();
  }

  const counts = batch
    ? {
        created: batch.createdCount,
        updated: batch.updatedCount,
        duplicate: batch.duplicateCount,
        error: batch.errorCount,
      }
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Upload form */}
      <Card>
        <CardHeader>
          <CardTitle>{t("uploadTitle")}</CardTitle>
          <CardDescription>{t("uploadSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Customer */}
              <div className="space-y-2">
                <Label htmlFor="import-customer">{t("customer")}</Label>
                <Select
                  value={customerId}
                  onValueChange={(value) => {
                    setCustomerId(value);
                    setTemplateId("");
                  }}
                  disabled={customersQuery.isLoading || Boolean(batchId)}
                >
                  <SelectTrigger id="import-customer">
                    <SelectValue placeholder={t("selectCustomer")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(customersQuery.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.customerCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {customersQuery.isError ? (
                  <p className="text-sm text-destructive">{t("customersLoadError")}</p>
                ) : null}
              </div>

              {/* Template */}
              <div className="space-y-2">
                <Label htmlFor="import-template">{t("template")}</Label>
                <Select
                  value={templateId}
                  onValueChange={setTemplateId}
                  disabled={
                    !customerId || templatesQuery.isLoading || Boolean(batchId)
                  }
                >
                  <SelectTrigger id="import-template">
                    <SelectValue placeholder={t("selectTemplate")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(templatesQuery.data ?? []).map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.name} (v{tpl.version})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {customerId && templatesQuery.data?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noTemplates")}</p>
                ) : null}
              </div>
            </div>

            {/* File */}
            <div className="space-y-2">
              <Label htmlFor="import-file">{t("file")}</Label>
              <input
                id="import-file"
                type="file"
                accept=".csv,.xlsx"
                disabled={Boolean(batchId)}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">{t("fileHint")}</p>
            </div>

            {uploadError ? (
              <p className="text-sm text-destructive" role="alert">
                {uploadError}
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={
                  !customerId ||
                  !file ||
                  uploadMutation.isPending ||
                  Boolean(batchId)
                }
              >
                {uploadMutation.isPending ? t("uploading") : t("import")}
              </Button>
              {batchId ? (
                <Button type="button" variant="outline" onClick={resetForNewImport}>
                  {t("newImport")}
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Progress + counts (polled) */}
      {batchId ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              {t("progressTitle")}
              {status ? (
                <Badge variant={statusBadgeVariant(status)}>
                  {t(`status.${status}`)}
                </Badge>
              ) : null}
            </CardTitle>
            {batch ? (
              <CardDescription>{batch.fileName}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {batchQuery.isLoading && !batch ? (
              <p className="text-sm text-muted-foreground">{t("loadingProgress")}</p>
            ) : null}

            {batch?.errorMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {batch.errorMessage}
              </p>
            ) : null}

            {counts ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CountTile label={t("countNew")} value={counts.created} />
                <CountTile label={t("countUpdated")} value={counts.updated} />
                <CountTile label={t("countDuplicate")} value={counts.duplicate} />
                <CountTile label={t("countError")} value={counts.error} />
              </div>
            ) : null}

            {status === "completed" ? (
              <p className="text-sm font-medium text-green-600" role="status">
                {t("completedMsg")}
              </p>
            ) : null}

            {/* Confirm */}
            {batch ? (
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  onClick={() => confirmMutation.mutate()}
                  disabled={status !== "validated" || confirmMutation.isPending}
                >
                  {confirmMutation.isPending ? t("confirming") : t("confirm")}
                </Button>
                {status === "validated" ? (
                  <span className="text-sm text-muted-foreground">
                    {t("confirmHint")}
                  </span>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Preview / validation table */}
      {batchId && isValidatedOrLater ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("previewTitle")}</CardTitle>
            {batch ? (
              <CardDescription>
                {t("summary", {
                  created: batch.createdCount,
                  updated: batch.updatedCount,
                  duplicate: batch.duplicateCount,
                  error: batch.errorCount,
                })}
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            {rowsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("loadingRows")}</p>
            ) : rowsQuery.isError ? (
              <p className="text-sm text-destructive">{t("rowsLoadError")}</p>
            ) : (rowsQuery.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noRows")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">{t("rowNumber")}</TableHead>
                    <TableHead className="w-28">{t("outcome")}</TableHead>
                    <TableHead className="w-40">{t("matchDecision")}</TableHead>
                    <TableHead>{t("reasons")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rowsQuery.data?.items ?? []).map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="font-medium">{row.rowNumber}</TableCell>
                      <TableCell>
                        {row.outcome ? (
                          <Badge className={outcomeBadgeClass(row.outcome)}>
                            {t(`outcomes.${row.outcome}`)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.matchDecision
                          ? t(`match.${row.matchDecision}`)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.reasons.length > 0
                          ? row.reasons.map((r) => r.message).join(" · ")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
