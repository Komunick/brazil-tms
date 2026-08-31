import { redirect } from "next/navigation";
import { can } from "@brazil-tms/shared";
import { getTranslations } from "next-intl/server";
import { verifySession } from "@/lib/auth/session";
import { montarCatalogo } from "@/lib/auth/catalogo-de-acesso";
import { CargosClient } from "@/components/cargos/cargos-client";
import { SelosClient } from "@/components/cargos/selos-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * A TELA DE CARGOS (fatia 029, US1) — onde os 20 administradores deixam de precisar ser admin.
 *
 * O catálogo é montado NO SERVIDOR e desce como prop: ele deriva do `nav.ts`, e mandá-lo pronto
 * evita que a tela remonte a mesma tradução no cliente — duas montagens divergiriam no dia em que
 * alguém mexesse numa só.
 *
 * ── OS SELOS DIVIDEM A TELA, EM ABA ───────────────────────────────────────────────────────────
 *
 * Eles não dão acesso a nada (FR-013), e mesmo assim moram aqui: quem vem mexer em selo já está
 * nesta área, e um item próprio na barra ocuparia espaço permanente para uma tarefa rara. A aba
 * separa o assunto sem separar o lugar.
 *
 * A guarda é a de sempre: sem `manage_users`, a rota recusa mesmo que o menu já a esconda. Esconder
 * nunca é a única defesa (FR-006).
 */
export default async function CargosPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user, "manage_users")) redirect("/");

  const t = await getTranslations("Cargos");

  return (
    <Tabs defaultValue="cargos" className="space-y-4">
      <TabsList>
        <TabsTrigger value="cargos">{t("abaCargos")}</TabsTrigger>
        <TabsTrigger value="selos">{t("abaSelos")}</TabsTrigger>
      </TabsList>
      <TabsContent value="cargos">
        <CargosClient catalogo={montarCatalogo()} />
      </TabsContent>
      <TabsContent value="selos">
        <SelosClient />
      </TabsContent>
    </Tabs>
  );
}
