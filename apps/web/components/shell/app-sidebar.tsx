"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Coins,
  Building2,
  Container,
  Handshake,
  History,
  IdCard,
  LayoutDashboard,
  MapPinned,
  PanelLeftClose,
  PanelLeftOpen,
  PackageCheck,
  Route,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Star,
  Table2,
  TowerControl,
  Truck,
  Upload,
  Users,
  type LucideIcon,
  Activity,
  ClipboardList,
} from "lucide-react";
import { can, type Role } from "@brazil-tms/shared";
import { NAV_GRUPOS, NAV_ITEMS, ordenarComFilhos } from "@/lib/nav";
import { gravarMenuRecolhido } from "@/lib/ui/menu-recolhido";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Star,
  TowerControl,
  PackageCheck,
  Coins,
  Table2,
  MapPinned,
  IdCard,
  Handshake,
  BarChart3,
  Users,
  ScrollText,
  ShieldCheck,
  Building2,
  Route,
  Truck,
  Container,
  Upload,
  History,
  Activity,
  Sparkles,
  ClipboardList,
};

/**
 * Role-aware navigation. Items are filtered by `can(role, permission)` — hiding is additive only;
 * the BFF stays authoritative (FR-011). Labels come from the `Nav` i18n namespace (SC-006).
 */
export function AppSidebar({
  role,
  recolhidoInicial = false,
}: {
  role: Role;
  recolhidoInicial?: boolean;
}) {
  const t = useTranslations("Nav");
  const tGrupo = useTranslations("Nav.grupos");
  const tCommon = useTranslations("Common");
  const pathname = usePathname();
  const [recolhido, setRecolhido] = useState(recolhidoInicial);

  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || can(role, item.permission));

  function alternar(): void {
    const proximo = !recolhido;
    setRecolhido(proximo);
    gravarMenuRecolhido(proximo);
  }

  return (
    // As bordas são as DO MENU, não as do app: com a barra escura, a borda clara do tema geral
    // desenhava uma linha branca no meio do azul.
    //
    // O MENU ACOMPANHA A ROLAGEM (2026-08-23, a pedido). Ele tinha a altura da PÁGINA, então em
    // tela comprida — o painel do dia, a lista de viagens — descia junto e sumia: para trocar de
    // área era preciso voltar ao topo primeiro. Agora tem a altura da JANELA e fica grudado no
    // alto; a rolagem corre só no conteúdo. `self-start` é o que impede o flex de esticá-lo de
    // volta até a altura da página, o que anularia o `sticky` sem erro nenhum aparecer.
    //
    // O `overflow-y-auto` do <nav> é o par disso: preso à janela, o menu não pode mais crescer
    // para caber, então quem tiver muitos itens (ou tela baixa) rola a lista dentro dele.
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col self-start border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        recolhido ? "w-16" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border text-[0.95rem] font-semibold tracking-tight text-white",
          recolhido ? "justify-center px-0" : "justify-between px-4",
        )}
      >
        {/* Recolhido, o nome sai e sobra o botão: escrever "Brazil TMS" em dezesseis pixels daria
            três letras e uma reticência, que não é nome nem ícone.

            O nome encurtou em 27/08, a pedido — era "Brazil Transports TMS" e ocupava a largura
            inteira do cabeçalho, empurrando o botão de recolher contra a borda. A empresa continua
            escrita por extenso onde ela é PARTE (motivo de cancelamento, responsável por exceção);
            aqui era só o rótulo do produto. */}
        {recolhido ? null : <span className="truncate">{tCommon("appName")}</span>}
        <button
          type="button"
          onClick={alternar}
          aria-expanded={!recolhido}
          aria-label={recolhido ? tCommon("expandMenu") : tCommon("collapseMenu")}
          title={recolhido ? tCommon("expandMenu") : tCommon("collapseMenu")}
          className="rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          {recolhido ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
      <nav
        className={cn(
          "rolagem-discreta flex flex-1 flex-col gap-1 overflow-y-auto py-3",
          recolhido ? "px-2" : "px-3",
        )}
      >
        {/**
         * O MENU EM GRUPOS (2026-08-23, a pedido).
         *
         * Vinte e três itens sem hierarquia: Início e Auditoria tinham o mesmo peso, e achar
         * qualquer coisa exigia ler a lista inteira. Os grupos dão ao olho pontos de parada.
         *
         * ETIQUETA, NÃO PASTA. Nada recolhe, nada esconde, e todo item continua a um clique — a
         * ordem também não mudou, para quem já sabe onde as coisas estão continuar sabendo.
         *
         * COM O MENU RECOLHIDO vira um traço, porque ali não há largura para palavra nenhuma; e um
         * grupo cujos itens todos foram escondidos pela permissão não desenha título nem traço,
         * senão sobraria uma etiqueta anunciando o vazio.
         */}
        {NAV_GRUPOS.map((grupo, i) => {
          /**
           * A ORDEM DO GRUPO: cada pai seguido dos seus filhos (2026-08-27).
           *
           * A lista de `NAV_ITEMS` continua sendo a fonte da ordem — isto só puxa cada filho para
           * logo abaixo do pai dele, em vez de exigir que quem edita `nav.ts` mantenha os dois
           * juntos à mão. Um filho declarado longe do pai é um filho que um dia alguém separa sem
           * perceber, e o recuo passaria a apontar para o item errado.
           *
           * ── FILHO ÓRFÃO SOBE, EM VEZ DE SUMIR ─────────────────────────────────────────────
           *
           * Se a permissão escondeu o pai, o filho aparece no nível de cima. Recuá-lo sob um item
           * que não está na tela seria um recuo sem referência; escondê-lo junto tiraria acesso a
           * uma tela que a pessoa PODE ver, por efeito colateral de outra que ela não pode.
           */
          const doGrupo = ordenarComFilhos(
            visibleItems.filter((item) => item.grupo === grupo),
            new Set(visibleItems.map((x) => x.key)),
          );
          if (doGrupo.length === 0) return null;
          return (
            <div key={grupo} className={cn("flex flex-col gap-1", i > 0 && "mt-3")}>
              {recolhido ? (
                i > 0 ? (
                  <span aria-hidden className="mx-2 mb-1 border-t border-sidebar-border" />
                ) : null
              ) : (
                <span className="px-3 pb-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
                  {tGrupo(grupo)}
                </span>
              )}
              {doGrupo.map((item) => {
                const Icon = ICONS[item.icon] ?? LayoutDashboard;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const rotulo = t(item.key);
                /**
                 * O RECUO SÓ EXISTE COM O MENU ABERTO.
                 *
                 * Recolhido, a barra é uma coluna de ícones centralizados e não há largura para
                 * hierarquia: recuar ali só desalinharia os ícones, e o desalinho leria como defeito
                 * em vez de estrutura.
                 *
                 * O filho é filho porque o pai está logo acima — a posição já carrega a relação.
                 */
                const filho = Boolean(item.pai) && !recolhido;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    // O nome vira balão quando some da tela. Sem isto, um menu de ícones exige decorar
                    // dezoito desenhos — e o único jeito de conferir seria abrindo a página.
                    title={recolhido ? rotulo : undefined}
                    className={cn(
                      // A marca da esquerda é o que diz onde você está sem precisar comparar tons de
                      // fundo — de relance, a linha aparece antes da cor.
                      "flex items-center rounded-md border-l-2 py-2 transition-colors",
                      recolhido ? "justify-center px-0" : "gap-3 px-3",
                      /*
                        O filho é MENOR e mais claro que o pai, além de recuado.

                        Só o recuo não bastaria: numa lista onde todo item tem a mesma força
                        tipográfica, quatro pixels de margem leem como desalinho, não como
                        hierarquia. O peso menor diz "isto pertence ao de cima" antes de o olho
                        medir distância.
                      */
                      filho ? "ml-4 text-[0.8rem] font-normal" : "text-sm font-medium",
                      active
                        ? "border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground"
                        : "border-transparent text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "shrink-0",
                        // O ícone acompanha o texto: um desenho de tamanho cheio ao lado de um
                        // rótulo menor desfaria o recuo que ele deveria reforçar.
                        filho ? "h-3.5 w-3.5" : "h-4 w-4",
                        active ? "text-sidebar-primary" : "opacity-70",
                      )}
                      aria-hidden
                    />
                    {/* O rótulo sai do DOM em vez de ficar escondido: leitor de tela não deve anunciar
                  duas vezes o que o `title` já diz, e um `<span>` de largura zero encolhe o ícone. */}
                    {recolhido ? <span className="sr-only">{rotulo}</span> : <span>{rotulo}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
