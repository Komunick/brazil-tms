"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Selo {
  id: string;
  nome: string;
  cor: string;
  pessoas: number;
}

/** A mesma paleta do cartão — se as duas divergirem, o selo muda de cor ao abrir o perfil. */
const CORES: { chave: string; classe: string }[] = [
  { chave: "vermelho", classe: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" },
  { chave: "ambar", classe: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300" },
  {
    chave: "verde",
    classe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  { chave: "azul", classe: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300" },
  { chave: "roxo", classe: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300" },
  { chave: "cinza", classe: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300" },
];

/**
 * OS SELOS (fatia 029, US3) — reconhecimento, e nada além disso.
 *
 * ── ELES DIVIDEM A TELA COM OS CARGOS, E NÃO GANHAM ITEM DE MENU ──────────────────────────────
 *
 * Selo se cria uma vez e se aplica de vez em quando; um item próprio na barra ocuparia espaço
 * permanente para uma tarefa rara, ao lado justamente de "Cargos", que é onde quem vem mexer em selo
 * já está. Aba na mesma tela.
 *
 * ── E A TELA DIZ QUE ELES NÃO DÃO ACESSO ──────────────────────────────────────────────────────
 *
 * A frase não é decoração. Quem chega aqui vindo da aba de cargos está montando ACESSO, e um segundo
 * painel com nomes coloridos parece a continuação disso. Dizer em voz alta é o que impede alguém de
 * criar "Supervisor" achando que acabou de conceder algo.
 */
export function SelosClient() {
  const t = useTranslations("Selos");
  const qc = useQueryClient();

  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("azul");

  const consulta = useQuery({
    queryKey: ["selos"],
    queryFn: async () => {
      const res = await fetch("/api/selos");
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { selos: Selo[] };
    },
    staleTime: 5 * 60_000,
  });

  const criar = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/selos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), cor }),
      });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: () => {
      setNome("");
      void qc.invalidateQueries({ queryKey: ["selos"] });
    },
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/selos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["selos"] }),
  });

  const selos = consulta.data?.selos ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("naoDaoAcesso")}</p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="selo-nome">{t("nomeDoNovo")}</Label>
          <Input
            id="selo-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={t("exemploDeNome")}
            className="w-56"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="selo-cor">{t("cor")}</Label>
          <select
            id="selo-cor"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {CORES.map((c) => (
              <option key={c.chave} value={c.chave}>
                {t(`cores.${c.chave}`)}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          disabled={nome.trim().length < 2 || criar.isPending}
          onClick={() => criar.mutate()}
        >
          {t("criar")}
        </Button>
      </div>

      {consulta.isPending ? <Skeleton className="h-32 w-full" /> : null}

      {selos.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 pt-6">
            {selos.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <span
                  className={cn(
                    "rounded px-1.5 py-px text-[0.7rem] font-medium",
                    CORES.find((c) => c.chave === s.cor)?.classe ?? CORES[5]!.classe,
                  )}
                >
                  {s.nome}
                </span>
                {/* A contagem vem antes de deixar apagar: um selo em quinze pessoas some de quinze
                    perfis de uma vez, e saber disso antes muda a decisão. */}
                <span className="text-xs text-muted-foreground">
                  {t("pessoas", { n: String(s.pessoas) })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-muted-foreground"
                  disabled={apagar.isPending}
                  onClick={() => apagar.mutate(s.id)}
                >
                  {t("apagar")}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
