import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { DispatchBoard } from "@/components/trips/dispatch/dispatch-board";

/**
 * Dispatch Board page (006 US5, §15.6). Server guard ENFORCES the pre-declared `assign_resources`
 * permission for the first time (granted to Admin / Ops Manager / Dispatcher / Fleet Coordinator) —
 * an authenticated user without it is redirected home; the BFF stays authoritative on the writes.
 * A fila não carrega mais as listas de frota: a escala interna do TMS saiu da tela em 2026-08-22,
 * e com ela os seletores de motorista/veículo do NOSSO cadastro. Quem escala é o portal, e os
 * motoristas de lá vêm da própria rota de atribuição. Freshness é polling (TanStack Query) — sem Realtime.
 */
export default async function DispatchPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user.role, "assign_resources")) redirect("/");

  const t = await getTranslations("Dispatch");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <DispatchBoard />
    </div>
  );
}
