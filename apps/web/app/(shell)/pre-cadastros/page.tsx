import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { FilaPreCadastrosClient } from "@/components/pre-cadastros/fila-pre-cadastros-client";

/**
 * A FILA DE PRÉ-CADASTROS (fatia 028, etapa 2).
 *
 * A porta de dentro para o que o formulário público recebe. Guarda em `manage_fleet_data`, a mesma
 * chave do cadastro de motorista — quem confere um pré-cadastro está fazendo trabalho de cadastro,
 * e uma permissão nova para o mesmo grupo de pessoas seria uma chave a mais para administrar sem
 * nada em troca.
 *
 * O subtítulo diz o que a tela AINDA não faz. É deliberado: quem abrir esperando conferir campo a
 * campo precisa descobrir em dois segundos que essa parte é P2, em vez de procurar um botão que não
 * existe e concluir que a tela está quebrada.
 */
export default async function PreCadastrosPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user, "manage_fleet_data")) redirect("/");

  const t = await getTranslations("PreCadastros");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <FilaPreCadastrosClient />
    </div>
  );
}
