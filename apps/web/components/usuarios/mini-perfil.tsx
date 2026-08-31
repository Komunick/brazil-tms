"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Perfil {
  id: string;
  nome: string;
  cargo: string | null;
  selos: { nome: string; cor: string }[];
  iniciais: string;
  temFoto: boolean;
  ativo: boolean;
}

/** A paleta dos selos, fechada — o valor vem do banco e cai no cinza se não for um destes. */
const COR: Record<string, string> = {
  vermelho: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  ambar: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  verde: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  azul: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  roxo: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  cinza: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
};

/**
 * O CARTÃO DO MINI PERFIL (fatia 029, US2) — foto, nome, cargo e selos.
 *
 * ── O QUE ELE NÃO MOSTRA ──────────────────────────────────────────────────────────────────────
 *
 * E-mail e lista de capacidades. O cartão responde "quem é essa pessoa e o que ela faz" — não "o
 * que ela alcança". Uma tela que qualquer autenticado abre não é lugar de expor o mapa de acesso.
 *
 * ── AS INICIAIS QUANDO NÃO HÁ FOTO ────────────────────────────────────────────────────────────
 *
 * E nunca um ícone genérico igual para todos: numa lista de trinta linhas, trinta desenhos idênticos
 * não distinguem ninguém — é o mesmo que não mostrar nada, ocupando espaço (FR-020).
 */
export function MiniPerfil({ userId }: { userId: string }) {
  const t = useTranslations("Perfil");

  const consulta = useQuery({
    queryKey: ["perfil", userId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/perfil`);
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as Perfil;
    },
    // Nome, cargo e selo mudam raramente; o cartão abre e fecha o tempo todo. Sem isto, cada abertura
    // seria uma consulta para responder o mesmo.
    staleTime: 5 * 60_000,
  });

  if (consulta.isPending) return <Skeleton className="h-20 w-56" />;
  if (!consulta.data) return <p className="text-sm text-muted-foreground">{t("naoEncontrado")}</p>;

  const p = consulta.data;

  return (
    <div className="flex items-start gap-3">
      {p.temFoto ? (
        /*
          `img` cru e não `next/image`: a rota devolve um REDIRECIONAMENTO para um link assinado de
          cinco minutos, e o otimizador do Next tentaria buscar e cachear a imagem — cache de rosto
          de funcionário atrás de link temporário é justamente o que o FR-022 evita.
        */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/users/${p.id}/foto`}
          alt=""
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground"
        >
          {p.iniciais}
        </div>
      )}

      <div className="min-w-0 space-y-1">
        <p className="truncate font-medium">{p.nome}</p>

        {p.cargo ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            {p.cargo}
          </p>
        ) : (
          /* Sem cargo o conjunto é VAZIO — a pessoa entra e não vê nada. Dizer isso aqui é o que
             transforma "a tela não abre" numa informação acionável para quem estiver olhando. */
          <p className="text-xs text-destructive">{t("semCargo")}</p>
        )}

        {p.selos.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {p.selos.map((s) => (
              <span
                key={s.nome}
                className={cn(
                  "rounded px-1.5 py-px text-[0.65rem] font-medium",
                  COR[s.cor] ?? COR.cinza,
                )}
              >
                {s.nome}
              </span>
            ))}
          </div>
        ) : null}

        {!p.ativo ? <p className="text-xs text-muted-foreground">{t("contaDesativada")}</p> : null}
      </div>
    </div>
  );
}
