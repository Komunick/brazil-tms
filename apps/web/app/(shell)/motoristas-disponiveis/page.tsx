import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { MotoristasDisponiveisClient } from "@/components/fleet/motoristas-disponiveis-client";

/**
 * MOTORISTAS DISPONÍVEIS (fatia 031, 03/09) — a planilha PROGRAMAÇÃO SHOPEE FROTA, viva.
 *
 * A pergunta que a operação faz o dia inteiro — *quem está livre para pegar carga?* — hoje custa
 * abrir uma planilha, torcer para alguém a ter atualizado e, na dúvida, ligar para o motorista.
 * Aqui ela é lida do que o portal do cliente já manda, e ninguém digita nada.
 *
 * Guarda de servidor com `view_all_trips`, a mesma da Torre de Controle: a lista é feita de viagens,
 * e quem não pode vê-las não teria o que ler. A rota repete a verificação — a guarda daqui evita a
 * tela piscar antes do redirecionamento, mas quem decide de verdade é o BFF.
 */
export default async function MotoristasDisponiveisPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user, "view_all_trips")) redirect("/");

  const t = await getTranslations("MotoristasDisponiveis");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <MotoristasDisponiveisClient />
    </div>
  );
}
