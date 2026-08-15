"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  OPERATIONAL_FIELDS,
  OPERATIONAL_FIELD_LABELS,
  OPERATIONAL_FIELD_MAX_LENGTH,
  type OperationalField,
} from "@brazil-tms/shared";
import type { TripDetailView } from "@brazil-tms/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TripsError, useUpdateOperationalFields } from "@/lib/trips/client";

/**
 * The operation's own annotations on a trip — solicitação, checklist, SM Raster, CT-e, doca
 * (2026-08-15). These five live today ONLY in a hand-maintained spreadsheet; this form is what lets
 * that spreadsheet be switched off, so it is deliberately plain: five boxes, one save, no wizard.
 *
 * Blank clears the field. The import never overwrites what is typed here (`operational_fields` is a
 * separate column from the file's `customer_fields`), so a person's entry survives every re-import.
 */

type Draft = Record<OperationalField, string>;

function draftFrom(trip: TripDetailView): Draft {
  const stored = (trip.operationalFields ?? {}) as Partial<Record<OperationalField, string>>;
  return Object.fromEntries(OPERATIONAL_FIELDS.map((f) => [f, stored[f] ?? ""])) as Draft;
}

export function OperationalFieldsForm({ trip }: { trip: TripDetailView }) {
  const t = useTranslations("Trips.operationalFields");
  const update = useUpdateOperationalFields(trip.id);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(trip));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // The trip poll is the source of truth: when it brings different values (another operator, or a
  // fresh import), the boxes follow — unless this user is mid-save.
  useEffect(() => {
    if (!update.isPending) setDraft(draftFrom(trip));
  }, [trip, update.isPending]);

  const stored = (trip.operationalFields ?? {}) as Partial<Record<OperationalField, string>>;
  const dirty = OPERATIONAL_FIELDS.some((f) => draft[f] !== (stored[f] ?? ""));

  function save() {
    setError(null);
    setSaved(false);
    // Send only what changed — an untouched field must stay untouched, not be re-written.
    const changes = Object.fromEntries(
      OPERATIONAL_FIELDS.filter((f) => draft[f] !== (stored[f] ?? "")).map((f) => [f, draft[f]]),
    );
    update.mutate(changes, {
      onSuccess: () => setSaved(true),
      onError: (e) => {
        const code = e instanceof TripsError ? e.code : "REQUEST_FAILED";
        setError(code === "TRIP_CLOSED" ? t("errorClosed") : t("errorGeneric"));
      },
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{t("title")}</h3>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {OPERATIONAL_FIELDS.map((field) => (
          <div key={field} className="space-y-1.5">
            <Label htmlFor={`op-${field}`} className="text-xs text-muted-foreground">
              {OPERATIONAL_FIELD_LABELS[field]}
            </Label>
            <Input
              id={`op-${field}`}
              value={draft[field]}
              maxLength={OPERATIONAL_FIELD_MAX_LENGTH}
              onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" disabled={!dirty || update.isPending} onClick={save}>
          {update.isPending ? t("saving") : t("save")}
        </Button>
        {saved && !dirty ? (
          <span className="text-xs text-muted-foreground" role="status">
            {t("saved")}
          </span>
        ) : null}
        {error ? (
          <span className="text-xs text-destructive" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </section>
  );
}
