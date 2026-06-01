import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Trip Detail placeholder sections: documents + billing detail (→ 008) are NOT built yet. Each renders
 * a labelled card whose body documents that the feature is available in a future step. Presentational
 * (no `"use client"`). The assignment section is the live `AssignmentPanel` (006); the exceptions
 * section is the live `ExceptionPanel` (007) — neither is a placeholder anymore.
 */
function PlaceholderCard({
  titleKey,
  bodyKey,
}: {
  titleKey: "sectionDocuments" | "sectionBilling";
  bodyKey: "placeholderDocuments" | "placeholderBilling";
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

export function DocumentsPlaceholder() {
  return <PlaceholderCard titleKey="sectionDocuments" bodyKey="placeholderDocuments" />;
}

export function BillingPlaceholder() {
  return <PlaceholderCard titleKey="sectionBilling" bodyKey="placeholderBilling" />;
}
