import { redirect } from "next/navigation";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { montarCatalogo } from "@/lib/auth/catalogo-de-acesso";
import { CargosClient } from "@/components/cargos/cargos-client";

/**
 * A TELA DE CARGOS (fatia 029, US1) — onde os 20 administradores deixam de precisar ser admin.
 *
 * O catálogo é montado NO SERVIDOR e desce como prop: ele deriva do `nav.ts`, e mandá-lo pronto
 * evita que a tela remonte a mesma tradução no cliente — duas montagens divergiriam no dia em que
 * alguém mexesse numa só.
 *
 * A guarda é a de sempre: sem `manage_users`, a rota recusa mesmo que o menu já a esconda. Esconder
 * nunca é a única defesa (FR-006).
 */
export default async function CargosPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user, "manage_users")) redirect("/");

  return <CargosClient catalogo={montarCatalogo()} />;
}
