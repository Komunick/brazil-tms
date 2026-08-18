import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decideAccess, verifySession } from "@/lib/auth/session";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { Topbar } from "@/components/shell/topbar";
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
        <Topbar userName={session.user.name} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
