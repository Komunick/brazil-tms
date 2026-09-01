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

  /*
    A TV NÃO GANHA EXCEÇÃO (2026-09-01, decisão do usuário). Perguntei se o cartão deveria sair
    sozinho lá na madrugada, e a resposta foi que há gente trabalhando de madrugada e que se aceita
    de madrugada. Então a permissão desce aqui igual ao shell: o painel roda sob uma sessão de
    verdade, e quem estiver logado nele decide como decidiria em qualquer outra tela.
  */
  return <Wallboard podeDecidir={can(session.user, "assign_resources")} />;
}
