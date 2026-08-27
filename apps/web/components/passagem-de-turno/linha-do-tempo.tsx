"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { DEFINICAO_DO_TURNO, ROTULO_DO_SETOR, type Setor, type Turno } from "@brazil-tms/shared";
import { cn } from "@/lib/utils";

interface BlocoNaLista {
  id: string;
  data: string;
  turno: Turno;
  setor: Setor;
  assistente: string | null;
  supervisor: string | null;
  fechadoEm: string | null;
  fechadoAutomaticamente: boolean;
  itens: number;
}

/**
 * A LINHA DO TEMPO — os turnos anteriores (2026-08-26, a pedido).
 *
 * "Todo dia gera um relatório novo e o antigo fica registrado." Na planilha isso é uma aba por dia,
 * criada à mão, e é por isso que só existem oito. Aqui não há o que gerar: a chave `(data, turno,
 * setor)` já existe, e esta lista é a porta para as que já passaram.
 *
 * ── ELA TRAZ A CONTAGEM, NÃO O CONTEÚDO ───────────────────────────────────────────────────────
 *
 * A lista existe para ESCOLHER o que abrir. Carregar os itens de trinta blocos para desenhar trinta
 * linhas seria carregar o diário inteiro a cada abertura de página — e a contagem já responde à
 * pergunta que faz alguém clicar: "teve coisa nesse turno?".
 *
 * ── E ELA MOSTRA O SETOR DE TODO MUNDO ────────────────────────────────────────────────────────
 *
 * Sem filtro por setor por padrão, de propósito. Quem entra no turno precisa ver o que o setor ao
 * lado registrou — é a metade do valor de uma passagem de turno, e a metade que a planilha entrega
 * mal, porque exige rolar uma aba de trezentas linhas.
 */
export function LinhaDoTempo({
  atual,
  aoEscolher,
}: {
  atual: { data: string; turno: Turno; setor: Setor };
  aoEscolher: (b: { data: string; turno: Turno; setor: Setor }) => void;
}) {
  const t = useTranslations("PassagemTurno");
  const consulta = useQuery({
    queryKey: ["passagem-de-turno", "linha-do-tempo"],
    queryFn: async () => {
      const res = await fetch("/api/passagem-de-turno/linha-do-tempo?limite=40");
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { blocos: BlocoNaLista[] };
    },
    refetchInterval: 60_000,
  });

  const blocos = consulta.data?.blocos ?? [];
  // Só o que já passou: o bloco corrente está logo acima na tela, e repeti-lo aqui confundiria
  // "onde estou" com "onde já estive".
  const anteriores = blocos.filter(
    (b) => !(b.data === atual.data && b.turno === atual.turno && b.setor === atual.setor),
  );

  if (anteriores.length === 0) return null;

  return (
    <section className="space-y-2" aria-label={t("linhaDoTempo")}>
      <h2 className="text-sm font-semibold">{t("turnosAnteriores")}</h2>
      <ol className="divide-y rounded-lg border">
        {anteriores.map((b) => (
          <li key={b.id}>
            <button
              onClick={() => aoEscolher({ data: b.data, turno: b.turno, setor: b.setor })}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
            >
              <span className="w-20 shrink-0 tabular-nums">{formatarData(b.data)}</span>
              <span
                className={cn(
                  "w-8 shrink-0 rounded px-1 text-center text-xs font-medium",
                  b.turno === "T1" ? "bg-amber-100 text-amber-900" : "bg-slate-800 text-slate-100",
                )}
                title={DEFINICAO_DO_TURNO[b.turno].rotulo}
              >
                {b.turno}
              </span>
              <span className="w-28 shrink-0 truncate">{ROTULO_DO_SETOR[b.setor]}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {[b.assistente, b.supervisor].filter(Boolean).join(" · ") || t("semNomes")}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {b.itens > 0 ? t("registros", { n: b.itens }) : t("vazio")}
              </span>
              {b.fechadoEm ? (
                <Lock
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    // A trava automática não é uma entrega. Um cadeado pálido diz isso sem texto.
                    b.fechadoAutomaticamente ? "text-muted-foreground/40" : "text-muted-foreground",
                  )}
                  aria-label={b.fechadoAutomaticamente ? t("fechadoPelaTrava") : t("entregue")}
                />
              ) : (
                <span className="shrink-0 text-xs text-primary">{t("aberto")}</span>
              )}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** `2026-08-26` → `26/08`. Sem `Date`, que interpretaria a string em UTC e voltaria um dia. */
function formatarData(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
