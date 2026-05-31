"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { TripFilterOptions } from "@brazil-tms/db";
import { useTripDetail } from "@/lib/trips/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TripDetailHeader } from "@/components/trips/trip-detail/header";
import { CustomerPlanSection } from "@/components/trips/trip-detail/customer-plan";
import { TimelineSection } from "@/components/trips/trip-detail/timeline";
import { NotesSection } from "@/components/trips/trip-detail/notes";
import { AuditHistorySection } from "@/components/trips/trip-detail/audit-history";
import {
  BillingPlaceholder,
  DocumentsPlaceholder,
} from "@/components/trips/trip-detail/placeholders";
import { ExceptionPanel } from "@/components/trips/trip-detail/exception-panel";
import { AssignmentPanel } from "@/components/trips/trip-detail/assignment-panel";
import { PlanEditForm } from "@/components/trips/plan-edit-form";

/**
 * Trip Detail orchestrator (005 US2/US3). Read-first — freshness is polling via TanStack Query
 * (`useTripDetail`, no Realtime). Composes the section components in the §15.5 order. The plan editor
 * self-guards on `isNonEditableStatus`, so it is always rendered (it shows a read-only message when
 * the trip is closed/terminal).
 */
export function TripDetailClient({
  id,
  resourceOptions,
}: {
  id: string;
  resourceOptions: TripFilterOptions;
}) {
  const t = useTranslations("Trips.detail");
  const tCommon = useTranslations("Common");
  const { data, isLoading, isError } = useTripDetail(id);

  const backLink = (
    <Button asChild variant="outline">
      <Link href="/trips">{t("back")}</Link>
    </Button>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">{tCommon("loading")}</p>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data?.item) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-destructive">
          {isError ? t("loadError") : t("notFound")}
        </p>
        {backLink}
      </div>
    );
  }

  const trip = data.item;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        {backLink}
      </div>

      <TripDetailHeader trip={trip} />
      <CustomerPlanSection trip={trip} />
      <PlanEditForm trip={trip} />
      <AssignmentPanel trip={trip} resourceOptions={resourceOptions} />
      <TimelineSection trip={trip} />
      <ExceptionPanel trip={trip} />
      <DocumentsPlaceholder />
      <BillingPlaceholder />
      <NotesSection events={trip.events} />
      <AuditHistorySection audit={trip.audit} />
    </div>
  );
}
