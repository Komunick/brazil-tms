import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decideAccess, verifySession } from "@/lib/auth/session";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { Topbar } from "@/components/shell/topbar";
import { AvisoDeAtualizacao } from "@/components/shell/aviso-de-atualizacao";
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
      <AppSidebar permissoes={[...session.user.permissoes]} recolhidoInicial={recolhidoInicial} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* O cargo desce até aqui porque a barra de topo hospeda a navegação do telefone, e a lista
            de itens é filtrada por permissão — ver `MenuMovel`. */}
        <Topbar
          userId={session.user.id}
          userName={session.user.name}
          permissoes={[...session.user.permissoes]}
        />
        {/*
          A FAIXA DA JANELA DE ATUALIZAÇÃO fica ENTRE a barra de topo e o conteúdo, no fluxo.

          Aqui ela empurra a página para baixo em vez de cobri-la — ao contrário do aviso de spot,
          logo abaixo, que se posiciona SOBRE a tela. A diferença é de propósito: o spot precisa
          interromper, este precisa apenas ser lido sem atrapalhar quem está atribuindo.

          No shell, e não em cada tela, porque a operação passa o dia na Expedição e na Torre — um
          aviso que só existisse no Início não seria visto por ninguém.
        */}
        <AvisoDeAtualizacao />
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
      {/*
        A PERMISSÃO DESCE DO SERVIDOR, e é `decidir_spot` — a MESMA que as rotas exigem.

        ── O DEFEITO QUE ISTO CORRIGE (2026-09-01) ──────────────────────────────────────────────

        Aqui dizia `assign_resources`, e o comentário defendia a escolha afirmando que "nenhuma chave
        nova nasceu nesta fatia". Era verdade quando foi escrito e deixou de ser: a decisão da equipe
        (migração 0063) criou `decidir_spot` e as DUAS rotas passaram a exigi-la — `POST
        /api/spot-offers/:id/dispensar` e o `origem: "oferta_spot"` do `portal-action`. A tela ficou
        para trás e ninguém percebeu, porque quem testou era administrador e tem as duas.

        Medido em produção antes da correção: **18 pessoas** — os 17 do cargo Despachante e 1 de
        Gerente de operações — tinham `assign_resources` e NÃO tinham `decidir_spot`. Para elas os
        dois botões apareciam LIGADOS e o servidor devolvia 403 no clique. Pior que o botão ausente:
        o botão ligado promete que dá.

        O botão travado nunca foi a garantia — as rotas recusam de qualquer forma. Mas a tela e o
        servidor discordarem sobre QUEM DECIDE é um defeito por si só, e `chave-da-decisao.test.ts`
        passa a derrubar a build se as duas voltarem a divergir.
      */}
      <OfertaDeSpot podeDecidir={session.user.permissoes.has("decidir_spot")} />
    </div>
  );
}
