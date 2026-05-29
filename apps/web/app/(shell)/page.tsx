import { getTranslations } from "next-intl/server";
import { verifySession } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const t = await getTranslations("Shell");
  const session = await verifySession();
  const name = session.authenticated ? session.user.name : "";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("homeWelcome", { name })}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t("homeTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t("homeSubtitle")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
