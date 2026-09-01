import { redirect } from "next/navigation";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { DashboardWidgets } from "@/components/trips/dashboard/widgets";

/**
 * Home daily dashboard (US4, §15.2). Server guard enforces `view_all_trips` (held by all 7 internal
 * roles — no functional redirect, but kept for correctness/consistency with the other guarded pages);
 * the client `DashboardWidgets` polls the summary aggregates (60s, no Realtime). The welcome tone is
 * carried by the dashboard title/subtitle, replacing the old static Shell card.
 *
 * O QUADRO BRANCO ENTRA NOS CARTÕES QUE JÁ EXISTEM (2026-08-22, a pedido). Uma tela por frente
 * chegou a ser feita e foi descartada: PLAN e TENDÊNCIA já viviam aqui (os cartões de hoje/D1/D2
 * e a lista de status), e o que faltava — origem atrasada e spot — cabe dentro do cartão da
 * região. Tela nova para metade de uma informação que já estava na tela é tela a mais.
 *
 * SEM A SUPERFÍCIE DE ALERTAS (2026-08-19, a pedido). Depois que o portal passou a criar viagens
 * sozinho, o aviso "sem atribuição na janela" disparava para cada viagem nova — chegou a 253 avisos
 * ativos que ninguém podia resolver, e uma lista assim ensina a operação a ignorar a lista. Nada foi
 * apagado e nenhuma regra foi desligada: os alertas continuam sendo gravados e continuam visíveis na
 * Torre de Controle, que é onde se age sobre eles. Saíram só DAQUI, e voltam com uma linha.
 */
export default async function HomePage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user, "view_all_trips")) redirect("/");

  // O título e o subtítulo mudaram de casa (2026-08-23): moram no `DashboardWidgets`, para o botão
  // de personalizar poder sentar na mesma linha deles. Ver o comentário lá.
  //
  // O CARGO VAI JUNTO (2026-08-27, a pedido): a frente "Sem região" é card de administração, e quem
  // decide isso é o servidor. Mandar o papel inteiro em vez de um `ehAdmin` já resolvido deixa a
  // regra visível no componente, que é onde ela vale — e não escondida numa linha desta página.
  /*
    A permissão de DECIDIR desce separada do papel (2026-09-01, fatia 030): o cartão de spot ganhou
    ação na linha, e quem pode aceitar é quem tem "assign_resources" — a mesma chave da tela de
    viagem. Depois da 029 o papel não decide mais acesso; quem decide é o conjunto do cargo.
  */
  return (
    <DashboardWidgets
      papel={session.user.role}
      podeDecidir={session.user.permissoes.has("assign_resources")}
    />
  );
}
