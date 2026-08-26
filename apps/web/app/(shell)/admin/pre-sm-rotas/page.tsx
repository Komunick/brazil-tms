import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { PreSmRotasClient } from "@/components/master-data/pre-sm-rotas-client";

/**
 * A CONFERÊNCIA DAS CORRESPONDÊNCIAS ROTA → MODELO (2026-08-25, fatia 026).
 *
 * A carga propõe o casamento entre as nossas rotas e os modelos de Pré-SM da gerenciadora Logae;
 * aqui uma pessoa olha e confirma. **Só linha confirmada cria Pré-SM.**
 *
 * Guarda em `manage_commercial_data`, a mesma chave da malha de rotas — é a mesma natureza de
 * decisão: qual rota é qual. Quem escala usa o resultado disto, não o define.
 */
export default async function PreSmRotasPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user.role, "manage_commercial_data")) redirect("/");

  const t = await getTranslations("PreSmRotas");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <PreSmRotasClient />
    </div>
  );
}
