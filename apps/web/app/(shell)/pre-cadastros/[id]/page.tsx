import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { ConferenciaClient } from "@/components/pre-cadastros/conferencia-client";

/**
 * A CONFERÊNCIA de um pré-cadastro (fatia 028, etapa 4).
 *
 * Mesma chave da fila — `manage_fleet_data`. Quem confere um pré-cadastro está fazendo trabalho de
 * cadastro de motorista, e uma permissão nova para o mesmo grupo de pessoas seria mais uma chave
 * para administrar sem nada em troca.
 */
export default async function ConferenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user, "manage_fleet_data")) redirect("/");

  const { id } = await params;
  const t = await getTranslations("PreCadastros");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("conferirTitulo")}</h1>
        <p className="text-muted-foreground">{t("conferirSubtitulo")}</p>
      </header>
      <ConferenciaClient id={id} />
    </div>
  );
}
