import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { DashboardWidgets } from "@/components/trips/dashboard/widgets";

/**
 * Home daily dashboard (US4, §15.2). Server guard enforces `view_all_trips` (held by all 7 internal
 * roles — no functional redirect, but kept for correctness/consistency with the other guarded pages);
 * the client `DashboardWidgets` polls the summary aggregates (60s, no Realtime). The welcome tone is
 * carried by the dashboard title/subtitle, replacing the old static Shell card.
 *
 * SEM A SUPERFÍCIE DE ALERTAS (2026-08-19, a pedido). Depois que o portal passou a criar viagens
 * sozinho, o aviso "sem atribuição na janela" disparava para cada viagem nova — chegou a 253 avisos
 * ativos que ninguém podia resolver, e uma lista assim ensina a operação a ignorar a lista. Nada foi
 * apagado e nenhuma regra foi desligada: os alertas continuam sendo gravados e continuam visíveis na
 * Torre de Controle, que é onde se age sobre eles. Saíram só DAQUI, e voltam com uma linha.
 */
export default async function HomePage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user.role, "view_all_trips")) redirect("/");

  const t = await getTranslations("Trips.dashboard");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <DashboardWidgets />
    </div>
  );
}
