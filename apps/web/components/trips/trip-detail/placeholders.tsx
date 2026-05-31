import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Trip Detail placeholder sections: exceptions/SLA (→ 007), documents + billing detail (→ 008) are
 * NOT built in this slice. Each renders a labelled card whose body documents that the feature is
 * available in a future step. Presentational (no `"use client"`). The assignment section is now the
 * live `AssignmentPanel` (006) — no longer a placeholder.
 */
function PlaceholderCard({
  titleKey,
  bodyKey,
}: {
  titleKey: "sectionExceptions" | "sectionDocuments" | "sectionBilling";
  bodyKey: "placeholderExceptions" | "placeholderDocuments" | "placeholderBilling";
}) {
  const t = useTranslations("Trips.detail");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(titleKey)}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{t(bodyKey)}</p>
      </CardContent>
    </Card>
  );
}

export function ExceptionsPlaceholder() {
  return <PlaceholderCard titleKey="sectionExceptions" bodyKey="placeholderExceptions" />;
}

export function DocumentsPlaceholder() {
  return <PlaceholderCard titleKey="sectionDocuments" bodyKey="placeholderDocuments" />;
}

export function BillingPlaceholder() {
  return <PlaceholderCard titleKey="sectionBilling" bodyKey="placeholderBilling" />;
}
