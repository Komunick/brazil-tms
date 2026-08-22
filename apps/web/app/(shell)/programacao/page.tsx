import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { DashboardWidgets } from "@/components/trips/dashboard/widgets";

/**
 * Programação (2026-08-22, a pedido) — os cartões que até hoje moravam no Painel do dia.
 *
 * O Painel do dia passou a ser a visão por FRENTE, do quadro branco da sala, e estes cartões vieram
 * para cá inteiros: os mesmos números, o mesmo componente, os mesmos atalhos. Nada foi recalculado
 * nem redesenhado na mudança — quem já sabia ler estes cartões continua sabendo, só mudou a porta.
 *
 * Mesma permissão de antes (`view_all_trips`) e mesma atualização por polling, sem Realtime.
 */
export default async function ProgramacaoPage() {
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
