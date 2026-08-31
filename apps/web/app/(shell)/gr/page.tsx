import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { FilaGrClient } from "@/components/gr/fila-gr-client";

/**
 * A ABA GR — onde a Pré-SM é feita (2026-08-26, fatia 027).
 *
 * Tela de OPERAÇÃO, não de administração: mora perto da expedição e é usada todo dia. Guarda em
 * `assign_resources`, a mesma chave de quem atribui — é a mesma pessoa, porque a Pré-SM nasce da
 * atribuição que ela fez.
 */
export default async function GrPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user, "assign_resources")) redirect("/");

  const t = await getTranslations("GR");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <FilaGrClient />
    </div>
  );
}
