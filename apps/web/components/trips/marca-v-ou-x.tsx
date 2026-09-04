"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * O V E O X DA LINHA — a marcação de SM e de CTE (2026-09-04, a pedido).
 *
 * ── POR QUE DOIS BOTÕES, E NÃO UM CARTÃO ──────────────────────────────────────────────────────
 *
 * A SM era um selo que abria uma caixinha com "SM sim" e "SM não". Marcar custava dois cliques e um
 * alvo que aparecia depois do primeiro — num quadro de centenas de linhas, onde a mesma pessoa
 * marca dezenas seguidas, isso é o gesto errado. Agora os dois alvos estão à vista o tempo todo: um
 * clique, acabou.
 *
 * ── TRÊS ESTADOS, E O TERCEIRO É O IMPORTANTE ─────────────────────────────────────────────────
 *
 * Vazio não é "não". Vazio é "ninguém olhou", e é o estado da esmagadora maioria das linhas. Por
 * isso os dois ficam apagados quando não há marcação, e clicar no que já está marcado DESMARCA —
 * sem isso não haveria como voltar atrás de um clique errado a não ser marcando o contrário, que é
 * uma afirmação diferente e ficaria registrada como tal.
 */
export function MarcaVouX({
  valor,
  aoMarcar,
  podeMarcar,
  rotuloSim,
  rotuloNao,
}: {
  valor: boolean | null;
  aoMarcar: (v: boolean | null) => void;
  podeMarcar: boolean;
  rotuloSim: string;
  rotuloNao: string;
}) {
  const base =
    "flex size-5 items-center justify-center rounded transition-colors disabled:cursor-default";

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        disabled={!podeMarcar}
        aria-pressed={valor === true}
        aria-label={rotuloSim}
        title={rotuloSim}
        // Clicar no que já está marcado desmarca — é o único caminho de volta ao "ninguém olhou".
        onClick={() => aoMarcar(valor === true ? null : true)}
        className={cn(
          base,
          valor === true
            ? "bg-emerald-600 text-white dark:bg-emerald-500"
            : "text-muted-foreground/30 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300",
          !podeMarcar && "hover:bg-transparent hover:text-muted-foreground/30",
        )}
      >
        <Check className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        disabled={!podeMarcar}
        aria-pressed={valor === false}
        aria-label={rotuloNao}
        title={rotuloNao}
        onClick={() => aoMarcar(valor === false ? null : false)}
        className={cn(
          base,
          valor === false
            ? "bg-red-600 text-white dark:bg-red-500"
            : "text-muted-foreground/30 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/10 dark:hover:text-red-300",
          !podeMarcar && "hover:bg-transparent hover:text-muted-foreground/30",
        )}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
