import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decideAccess, verifySession } from "@/lib/auth/session";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { Topbar } from "@/components/shell/topbar";
import { OfertaDeSpot } from "@/components/spot/oferta-de-spot";
import { COOKIE_MENU } from "@/lib/ui/menu-recolhido";

/**
 * Authenticated shell. Server-side session guard (verifySession — getUser-based, NOT getSession):
 * unauthenticated → /login; a must_change_password OR still-pending user → /auth/set-password
 * (FR-013a). Passes the current role to the sidebar so only permitted areas render (US2).
 */
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (decideAccess(session) === "redirect_set_password") redirect("/auth/set-password");

  // Lido AQUI, no servidor, para a primeira pintura já sair recolhida — ver `menu-recolhido.ts`.
  const recolhidoInicial = (await cookies()).get(COOKIE_MENU)?.value === "1";

  return (
    <div className="flex min-h-screen">
      <AppSidebar role={session.user.role} recolhidoInicial={recolhidoInicial} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* O cargo desce até aqui porque a barra de topo hospeda a navegação do telefone, e a lista
            de itens é filtrada por permissão — ver `MenuMovel`. */}
        <Topbar userName={session.user.name} role={session.user.role} />
        {/* `p-4 md:p-6`: no telefone, 24px de cada lado saíam da largura útil do conteúdo. */}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
      {/**
       * O AVISO DE SPOT MORA NO SHELL, não numa tela (2026-08-22, a pedido).
       *
       * Ele nasceu dentro do painel do dia, e por isso só aparecia para quem estivesse justamente
       * na tela Início. Quem passa o dia na Expedição ou na Torre — que é onde a operação trabalha —
       * nunca via, e a oferta vale enquanto ninguém aceitou.
       *
       * Aqui em cima ele cobre TODAS as telas de uma vez, sem cada uma ter de lembrar de incluí-lo.
       * Ele se posiciona sobre a página e não ocupa lugar no fluxo: o que estiver embaixo continua
       * desenhado e clicável.
       *
       * O painel de parede tem o seu próprio (`(wall)`), porque não passa por este shell.
       */}
      <OfertaDeSpot />
    </div>
  );
}
