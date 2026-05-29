import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/session";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { Topbar } from "@/components/shell/topbar";

/**
 * Authenticated shell. Server-side session guard (verifySession — getUser-based, NOT getSession):
 * unauthenticated → /login; a must_change_password user → /auth/set-password (FR-013a). Passes the
 * current role to the sidebar so only permitted areas render (US2).
 */
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (session.user.mustChangePassword) redirect("/auth/set-password");

  return (
    <div className="flex min-h-screen">
      <AppSidebar role={session.user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userName={session.user.name} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
