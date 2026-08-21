"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { ACEITACAO_PENDENTE, formatDateTime } from "@brazil-tms/shared";
import type { TripAssignmentDto, TripDetailView, TripFilterOptions } from "@brazil-tms/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssignmentForm } from "@/components/trips/dispatch/assignment-form";
import { OperationalFieldsForm } from "@/components/trips/trip-detail/operational-fields-form";

/**
 * Trip-Detail assignment panel (006 US1/US3/US4) — fills slice 005's `AssignmentPlaceholder`. Shows
 * the current assignment (resource names + notes + override reason + assigned/confirmed by/at), the
 * retained supersession history chain (newest-first), and embeds the shared `AssignmentForm` for
 * assign/reassign/confirm/unassign. The form only renders when the trip is in an assignable status
 * (`received`/`assigned`/`confirmed`; slice 015 retargeted off the removed `validated` state); other
 * statuses show the read-only history only. Read-first freshness is the parent `useTripDetail` poll
 * (no Realtime); all text is pt-BR.
 */

const ASSIGNABLE_STATUSES = new Set(["received", "assigned", "confirmed"]);

export function AssignmentPanel({
  trip,
  resourceOptions,
}: {
  trip: TripDetailView;
  resourceOptions: TripFilterOptions;
}) {
  const t = useTranslations("Dispatch");

  const current = trip.currentAssignment;
  const history = trip.assignmentHistory;
  /**
   * EM ANÁLISE NÃO ATRIBUI (2026-08-21, a pedido).
   *
   * A ordem da operação é aceitar primeiro, escalar depois: viagem em análise é uma PROPOSTA que o
   * cliente ainda espera responder, e pôr motorista nela é comprometer recurso com um trabalho que
   * a empresa pode recusar.
   *
   * A trava não podia morar no status: as duas filas vivem no mesmo `received`, e só a aceitação as
   * separa. O histórico continua visível — o que some é o formulário.
   */
  const emAnalise =
    ((trip.customerFields ?? {}) as Record<string, string>)["Aceitação (portal)"] ===
    ACEITACAO_PENDENTE;
  const canAssign = ASSIGNABLE_STATUSES.has(trip.currentStatus) && !emAnalise;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("panelTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Milk run: the legs of the same customer programming, with this one marked. Only renders
            when the file actually chained movements under one id. */}
        {trip.siblingLegs.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">
              {t("legsTitle", {
                id: trip.externalTripId ?? "",
                leg: trip.legNumber,
                total: trip.siblingLegs.length + 1,
              })}
            </h3>
            <ul className="space-y-1 rounded-md border p-3 text-sm">
              {[...trip.siblingLegs, null]
                .map(
                  (leg) =>
                    leg ?? {
                      id: trip.id,
                      legNumber: trip.legNumber,
                      originCode: trip.originCode,
                      destinationCode: trip.destinationCode,
                      plannedPickupWindowStart: trip.plannedPickupWindowStart,
                      currentStatus: trip.currentStatus,
                    },
                )
                .sort((a, b) => a.legNumber - b.legNumber)
                .map((leg) => (
                  <li key={leg.id} className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums text-muted-foreground">{leg.legNumber}.</span>
                    <span>
                      {leg.originCode} → {leg.destinationCode}
                    </span>
                    <span className="text-muted-foreground">
                      {formatDateTime(leg.plannedPickupWindowStart)}
                    </span>
                    {leg.id === trip.id ? (
                      <span className="font-medium">{t("legsCurrent")}</span>
                    ) : (
                      <Link href={`/trips/${leg.id}`} className="text-primary hover:underline">
                        {t("legsOpen")}
                      </Link>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        {/* Current assignment ------------------------------------------------------------ */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("currentAssignment")}</h3>
          {current ? (
            <CurrentAssignment assignment={current} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("noCurrentAssignment")}</p>
          )}
        </section>

        {/* The operation's own annotations — editable here, never overwritten by an import. These
            five fields are the reason the planning spreadsheet still existed. */}
        <OperationalFieldsForm trip={trip} />

        {/* Customer's own columns, straight from the imported file (display-only) ---------- */}
        {trip.customerFields && Object.keys(trip.customerFields).length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{t("customerFields")}</h3>
            <div className="rounded-md border p-3">
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(trip.customerFields).map(([label, value]) => (
                  <Field key={label} label={label} value={value} />
                ))}
              </dl>
            </div>
            <p className="text-xs text-muted-foreground">{t("customerFieldsHint")}</p>
          </section>
        ) : null}

        {/* Assign / reassign / confirm / unassign form ----------------------------------- */}
        {canAssign ? (
          <section className="space-y-2">
            <AssignmentForm
              tripId={trip.id}
              currentStatus={trip.currentStatus}
              currentAssignment={current}
              resourceOptions={resourceOptions}
            />
          </section>
        ) : null}

        {/* Retained history chain (newest-first) ----------------------------------------- */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("history")}</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
          ) : (
            <ul className="space-y-3">
              {history.map((a) => (
                <li key={a.id} className="rounded-md border p-3">
                  <AssignmentSummary assignment={a} showSuperseded />
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

/** The current assignment block (resource names + notes + override + by/at metadata). */
function CurrentAssignment({ assignment }: { assignment: TripAssignmentDto }) {
  return (
    <div className="rounded-md border p-3">
      <AssignmentSummary assignment={assignment} />
    </div>
  );
}

/** A single assignment's fields, shared by the current block and each history row. */
function AssignmentSummary({
  assignment,
  showSuperseded,
}: {
  assignment: TripAssignmentDto;
  showSuperseded?: boolean;
}) {
  const t = useTranslations("Dispatch");

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {/**
       * CNH VENCIDA, em vermelho, colado no nome (2026-08-19, decisão do usuário).
       *
       * O TMS RECUSAVA atribuir motorista com CNH vencida — documento vencido é bloqueio duro na
       * regra de elegibilidade. A decisão foi outra: atribuir mesmo assim e avisar. O portal é quem
       * escala, e uma viagem sem motorista no quadro esconde o problema em vez de mostrá-lo.
       *
       * Então o aviso tem de estar ONDE a pessoa olha o motorista, não numa tela de relatório: quem
       * abre a viagem para saber quem vai dirigir precisa ver a validade no mesmo instante.
       *
       * A conta é contra o relógio de quem olha, e não contra um valor guardado: uma CNH vence
       * sozinha com o tempo passando, sem ninguém escrever nada no banco.
       */}
      <Field
        label={t("driver")}
        value={assignment.driverName}
        aviso={
          assignment.driverLicenseExpiry && new Date(assignment.driverLicenseExpiry) < new Date()
            ? t("expiredLicense", { date: formatarData(assignment.driverLicenseExpiry) })
            : null
        }
      />
      <Field label={t("vehicle")} value={assignment.vehiclePlate} />
      <Field label={t("trailer")} value={assignment.trailerLabel} />
      <Field label={t("carrier")} value={assignment.carrierName} />
      {assignment.notes ? <Field label={t("notes")} value={assignment.notes} /> : null}
      {assignment.overrideReason ? (
        <Field label={t("overrideReason")} value={assignment.overrideReason} />
      ) : null}
      {/* Name, not the raw user id — "0e6a3bf0-739a-…" told a dispatcher nothing. */}
      <Field
        label={t("assignedBy")}
        value={assignment.assignedByName ?? assignment.assignedByUserId}
      />
      <Field label={t("assignedAt")} value={formatDateTime(assignment.assignedAt)} />
      {assignment.confirmedAt ? (
        <>
          <Field label={t("confirmedBy")} value={assignment.confirmedByUserId} />
          <Field label={t("confirmedAt")} value={formatDateTime(assignment.confirmedAt)} />
        </>
      ) : null}
      {showSuperseded && assignment.supersededAt ? (
        <Field label={t("supersededAt")} value={formatDateTime(assignment.supersededAt)} />
      ) : null}
    </dl>
  );
}

function Field({
  label,
  value,
  aviso,
}: {
  label: string;
  value: ReactNode;
  /** Texto de alerta que fica ABAIXO do valor, em vermelho. Hoje só a CNH vencida usa. */
  aviso?: string | null;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value ?? "—"}</dd>
      {aviso ? (
        <p className="flex items-center gap-1 text-xs font-semibold text-destructive">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {aviso}
        </p>
      ) : null}
    </div>
  );
}

/** `2026-01-09` → `09/01/2026`. Data só, sem hora: validade de CNH não tem minuto. */
function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}
