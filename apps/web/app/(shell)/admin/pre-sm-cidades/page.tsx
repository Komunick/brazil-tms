import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { PreSmCidadesClient } from "@/components/master-data/pre-sm-cidades-client";

/**
 * A CONFERÊNCIA DAS CORRESPONDÊNCIAS ESTAÇÃO → CIDADE (2026-08-26, fatia 027).
 *
 * O `setPreSM` pede o código IBGE das cidades de coleta e de entrega. A carga tira a cidade do NOME
 * da estação — `SOC_MG_BETIM` vira `MG · BETIM` — e casa contra o cadastro dela; aqui uma pessoa
 * olha e confirma. **Só linha confirmada vale.**
 *
 * Guarda em `manage_commercial_data`, a mesma da tela de rotas: é a mesma natureza de decisão, e
 * quem escala usa o resultado disto, não o define.
 */
export default async function PreSmCidadesPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user, "manage_commercial_data")) redirect("/");

  const t = await getTranslations("PreSmCidades");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <PreSmCidadesClient />
    </div>
  );
}
