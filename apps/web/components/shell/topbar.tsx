"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Topbar({ userName }: { userName: string }) {
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
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/85 px-6 backdrop-blur">
      <div className="text-sm font-medium text-foreground">{userName}</div>
      <Button variant="ghost" size="sm" onClick={signOut} disabled={loading}>
        <LogOut className="mr-2 h-4 w-4" aria-hidden />
        {t("signOut")}
      </Button>
    </header>
  );
}
