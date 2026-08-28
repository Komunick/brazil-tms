"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import type { Role } from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";
import { MenuMovel } from "@/components/shell/menu-movel";

export function Topbar({ userName, role }: { userName: string; role: Role }) {
  const t = useTranslations("Shell");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    // Gruda no topo: as listas do app são longas, e rolar até o fim escondia a saída.
    //
    // NO TELEFONE ELA CARREGA A NAVEGAÇÃO (2026-08-28): a barra lateral some abaixo de `md`, e este
    // é o único lugar que sobra sempre visível. `px-3 md:px-6` porque seis unidades de cada lado
    // custam 48px — num aparelho de 390px é um oitavo da tela gasto em margem.
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b bg-background/85 px-3 backdrop-blur md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MenuMovel role={role} />
        {/* `truncate` porque nome comprido em tela estreita empurrava o botão de sair para fora. */}
        <div className="truncate text-sm font-medium text-foreground">{userName}</div>
      </div>
      <Button variant="ghost" size="sm" onClick={signOut} disabled={loading} className="shrink-0">
        <LogOut className="mr-2 h-4 w-4" aria-hidden />
        {t("signOut")}
      </Button>
    </header>
  );
}
