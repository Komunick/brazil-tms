import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
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

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      {/*
        QUEM ESTÁ OLHANDO desce da PÁGINA, e não de uma chamada do navegador (2026-08-26).

        O id serve para uma coisa só: decidir se o botão de apagar aparece no comentário. Quem
        garante que ninguém apaga o recado de outra pessoa é o servidor, dentro do `where` que
        apaga — isto aqui é conveniência de tela.
      */}
      <MinhaProgramacaoClient
        userId={session.user.id}
        podeAtribuir={can(session.user.role, "assign_resources")}
      />
    </div>
  );
}
