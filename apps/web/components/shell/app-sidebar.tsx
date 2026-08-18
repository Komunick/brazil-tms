"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Building2,
  Container,
  Factory,
  History,
  LayoutDashboard,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  ScrollText,
  Truck,
  Upload,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { can, type Role } from "@brazil-tms/shared";
import { NAV_ITEMS } from "@/lib/nav";
import { gravarMenuRecolhido } from "@/lib/ui/menu-recolhido";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  BarChart3,
  Users,
  ScrollText,
  Building2,
  MapPin,
  Route,
  UserRound,
  Truck,
  Container,
  Factory,
  Upload,
  History,
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
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        recolhido ? "w-16" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border text-[0.95rem] font-semibold tracking-tight text-white",
          recolhido ? "justify-center px-0" : "justify-between px-4",
        )}
      >
        {/* Recolhido, o nome sai e sobra o botão: escrever "Brazil Transports" em dezesseis pixels
            daria três letras e uma reticência, que não é nome nem ícone. */}
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
      <nav className={cn("flex flex-1 flex-col gap-1 py-3", recolhido ? "px-2" : "px-3")}>
        {visibleItems.map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const rotulo = t(item.key);
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
                "flex items-center rounded-md border-l-2 py-2 text-sm font-medium transition-colors",
                recolhido ? "justify-center px-0" : "gap-3 px-3",
                active
                  ? "border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground"
                  : "border-transparent text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon
                className={cn("h-4 w-4 shrink-0", active ? "text-sidebar-primary" : "opacity-70")}
                aria-hidden
              />
              {/* O rótulo sai do DOM em vez de ficar escondido: leitor de tela não deve anunciar
                  duas vezes o que o `title` já diz, e um `<span>` de largura zero encolhe o ícone. */}
              {recolhido ? <span className="sr-only">{rotulo}</span> : <span>{rotulo}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
