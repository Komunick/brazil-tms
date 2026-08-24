import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { getTripFilterOptions } from "@/lib/trips/trips-read";
import { MinhaProgramacaoClient } from "@/components/trips/minha-programacao-client";

/**
 * Minha Programação (2026-08-23, a pedido) — as viagens que ESTA pessoa está acompanhando.
 *
 * Guarda de servidor com `view_all_trips`, a mesma das outras telas de leitura: a lista é pessoal,
 * mas o que ela mostra são viagens, e quem não pode vê-las não teria o que acompanhar. O recorte por
 * usuário acontece na consulta, com o id da sessão — nunca com um parâmetro da tela.
 */
export default async function MinhaProgramacaoPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user.role, "view_all_trips")) redirect("/");

  const t = await getTranslations("Programacao");
  // As listas de recurso vêm do servidor como SEMENTE, igual à tela de detalhe: a janela de
  // atribuição precisa delas prontas no primeiro desenho, senão o formulário abre sem opções.
  const resourceOptions = await getTripFilterOptions();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <MinhaProgramacaoClient resourceOptions={resourceOptions} />
    </div>
  );
}
