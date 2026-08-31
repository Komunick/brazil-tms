import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { can } from "@brazil-tms/shared";
import { decideAccess, verifySession } from "@/lib/auth/session";
import { Wallboard } from "@/components/wallboard/wallboard";

/**
 * `/painel` — a TV da sala.
 *
 * Fora do shell de propósito: sem menu lateral, sem barra de topo, sem nada em volta. A tela inteira
 * é o dado. É o mesmo guardião de sessão das outras páginas — quem liga a TV loga uma vez naquele
 * navegador e deixa aberto; uma rota pública "porque é só leitura" exporia a operação do cliente a
 * quem tivesse a URL.
 */
export const metadata: Metadata = {
  title: "Painel · Brazil Transports",
};

export default async function PainelPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (decideAccess(session) === "redirect_set_password") redirect("/auth/set-password");
  if (!can(session.user, "view_all_trips")) redirect("/");

  return <Wallboard />;
}
