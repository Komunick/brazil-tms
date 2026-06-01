"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { TripDetailView } from "@/lib/trips/trips-read";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TripsError,
  useMarkBillingReady,
  useMarkCompleted,
  type WaivedRequirementInput,
} from "@/lib/trips/client";

/**
 * Trip-Detail billing section (008, US2) — replaces the 005 `BillingPlaceholder`. Shows the computed
 * billing values (read-only at this stage) and the Mark Completed / Mark Billing Ready actions with a
 * server-side blockers display and a per-document waiver input. US4 extends this with the editable
 * rate/adjustment controls. All writes go through the BFF + invalidate `["trips"]`. pt-BR.
 */

function brl(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function BillingSection({ trip }: { trip: TripDetailView }) {
  const t = useTranslations("Billing");
  const complete = useMarkCompleted(trip.id);
  const billingReady = useMarkBillingReady(trip.id);

  const [waivers, setWaivers] = useState<WaivedRequirementInput[]>([]);
  const [waiveType, setWaiveType] = useState("");
  const [waiveReason, setWaiveReason] = useState("");
  const [blockers, setBlockers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const billing = trip.billing;
  // Required docs still missing (union, unique) — candidates for a waiver.
  const missing = Array.from(
    new Map(
      [...trip.documentSummary.completionMissing, ...trip.documentSummary.billingMissing].map((m) => [
        m.documentTypeId,
        m,
      ]),
    ).values(),
  ).filter((m) => !waivers.some((w) => w.documentTypeId === m.documentTypeId));

  const onError = (e: unknown, blockedCode: string) => {
    if (e instanceof TripsError) {
      const f = e.findings as unknown as { blockers?: string[] } | undefined;
      setBlockers(f?.blockers ?? []);
      setError(e.code === blockedCode ? null : e.code);
    } else {
      setError("REQUEST_FAILED");
    }
  };

  const addWaiver = () => {
    if (!waiveType || waiveReason.trim() === "") return;
    setWaivers((prev) => [...prev, { documentTypeId: waiveType, reason: waiveReason.trim() }]);
    setWaiveType("");
    setWaiveReason("");
  };

  const onComplete = () => {
    setBlockers([]);
    setError(null);
    complete.mutate(
      { waivedRequirements: waivers.length ? waivers : undefined },
      { onSuccess: () => setWaivers([]), onError: (e) => onError(e, "COMPLETION_BLOCKED") },
    );
  };

  const onBillingReady = () => {
    setBlockers([]);
    setError(null);
    billingReady.mutate(
      { waivedRequirements: waivers.length ? waivers : undefined },
      { onSuccess: () => setWaivers([]), onError: (e) => onError(e, "BILLING_READY_BLOCKED") },
    );
  };

  const labelFor = (typeId: string) =>
    [...trip.documentSummary.completionMissing, ...trip.documentSummary.billingMissing].find(
      (m) => m.documentTypeId === typeId,
    )?.labelPt ?? typeId;

  const canComplete = trip.currentStatus === "unloaded";
  const canBillingReady = trip.currentStatus === "billing_pending";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Computed values */}
        {billing ? (
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <div className="text-muted-foreground">{t("values.planned")}</div>
              <div className="font-medium">{brl(billing.plannedCents)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">{t("values.executed")}</div>
              <div className="font-medium">{brl(billing.executedCents)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">{t("values.adjustment")}</div>
              <div className="font-medium">{brl(billing.adjustmentCents)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">{t("values.final")}</div>
              <div className="font-medium">{brl(billing.finalBillableCents)}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("lists.empty")}</p>
        )}

        {billing && !billing.hasRate ? (
          <p className="text-xs text-amber-700">{t("rateBlocked")}</p>
        ) : null}

        {/* Blockers from the last refused gate */}
        {blockers.length > 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
            <div className="font-medium text-amber-900">{t("blockers.title")}</div>
            <ul className="mt-1 list-disc pl-5 text-amber-900">
              {blockers.map((b) => (
                <li key={b}>
                  {(() => {
                    try {
                      return t(`blockers.${b}` as Parameters<typeof t>[0]);
                    } catch {
                      return b;
                    }
                  })()}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Pending waivers */}
        {waivers.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {waivers.map((w) => (
              <span
                key={w.documentTypeId}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
              >
                {labelFor(w.documentTypeId)}
                <button
                  type="button"
                  className="text-muted-foreground"
                  onClick={() =>
                    setWaivers((prev) => prev.filter((x) => x.documentTypeId !== w.documentTypeId))
                  }
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {/* Waiver input (for a missing required document) */}
        {missing.length > 0 ? (
          <div className="space-y-2 rounded-md border p-3">
            <div className="text-sm font-medium">{t("waiver.title")}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="waive-type">{t("waiver.type")}</Label>
                <Select value={waiveType || undefined} onValueChange={setWaiveType}>
                  <SelectTrigger id="waive-type">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {missing.map((m) => (
                      <SelectItem key={m.documentTypeId} value={m.documentTypeId}>
                        {m.labelPt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="waive-reason">{t("waiver.reason")}</Label>
                <Input
                  id="waive-reason"
                  value={waiveReason}
                  onChange={(e) => setWaiveReason(e.target.value)}
                  maxLength={2000}
                />
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={addWaiver} disabled={!waiveType || !waiveReason.trim()}>
              {t("waiver.add")}
            </Button>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {canComplete ? (
            <Button size="sm" onClick={onComplete} disabled={complete.isPending}>
              {t("markCompleted")}
            </Button>
          ) : null}
          {canBillingReady ? (
            <Button size="sm" onClick={onBillingReady} disabled={billingReady.isPending}>
              {t("markBillingReady")}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
