import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { ServerStatusClient } from "@/components/status/server-status-client";

/**
 * Status do Sistema — o pulso dos robôs e das tarefas do servidor (2026-08-19).
 *
 * Guarda em `view_all_trips`, a mesma chave do painel e dos relatórios, e não numa de administração.
 * A pergunta que esta tela responde é "os números que estou vendo ainda são de agora?", e quem
 * precisa da resposta é quem usa o quadro. Uma tela de saúde que só o administrador enxerga repete o
 * defeito que ela existe para corrigir.
 */
export default async function ServerStatusPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user.role, "view_all_trips")) redirect("/");

  const t = await getTranslations("ServerStatus");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <ServerStatusClient />
    </div>
  );
}
