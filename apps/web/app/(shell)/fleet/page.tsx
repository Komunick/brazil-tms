import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { FleetClient } from "@/components/fleet/fleet-client";

/**
 * Rastreamento da frota (2026-08-20).
 *
 * Guarda em `view_all_trips`, a mesma chave do quadro e do Status do Sistema: quem acompanha viagem
 * precisa saber onde está o caminhão dela, e trancar isso atrás de uma chave de frota separaria duas
 * metades da mesma pergunta.
 *
 * A tela é alcançada pelo cartão da frota no topo da Torre de Controle, que é de onde a pergunta
 * nasce — alguém olhando as viagens e querendo saber onde o caminhão está.
 */
export default async function FleetPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user.role, "view_all_trips")) redirect("/");

  const t = await getTranslations("Fleet");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <FleetClient />
    </div>
  );
}
