"use client";

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
export function AppSidebar({ role }: { role: Role }) {
  const t = useTranslations("Nav");
  const tCommon = useTranslations("Common");
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || can(role, item.permission));

  return (
    // As bordas são as DO MENU, não as do app: com a barra escura, a borda clara do tema geral
    // desenhava uma linha branca no meio do azul.
    <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4 text-[0.95rem] font-semibold tracking-tight text-white">
        {tCommon("appName")}
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {visibleItems.map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                // A marca da esquerda é o que diz onde você está sem precisar comparar tons de
                // fundo — de relance, a linha aparece antes da cor.
                "flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground"
                  : "border-transparent text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon
                className={cn("h-4 w-4", active ? "text-sidebar-primary" : "opacity-70")}
                aria-hidden
              />
              <span>{t(item.key)}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
