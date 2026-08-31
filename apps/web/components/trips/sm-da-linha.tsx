"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useMarcarSm } from "@/lib/trips/client";
import { cn } from "@/lib/utils";

/**
 * A SM DA LINHA — "a Solicitação de Monitoramento já saiu?" (2026-08-31, a pedido).
 *
 * ── POR QUE UM SELO PRÓPRIO, AO LADO DO STATUS ────────────────────────────────────────────────
 *
 * O status é uma ESCADA: a enviar → enviado → prog OK, ou no show. Os degraus se excluem, e a linha
 * está num deles de cada vez.
 *
 * A SM é outra pergunta, e convive com qualquer degrau: dá para estar "Enviado" com SM emitida ou
 * sem. Como quinto valor do status, a tela teria de escolher entre dizer uma coisa ou a outra.
 *
 * ── TRÊS ESTADOS, E O CINZA NÃO É "NÃO" ───────────────────────────────────────────────────────
 *
 * Sem marca, o selo é um "SM" apagado — ninguém disse nada, e é a esmagadora maioria das linhas.
 * "SM Não" é uma AFIRMAÇÃO, em vermelho: alguém olhou e disse que não saiu. Pintar o não-marcado de
 * vermelho faria o quadro gritar sobre milhares de viagens que ninguém conferiu.
 */
export function SmDaLinha({
  tripId,
  sm,
  podeMarcar,
}: {
  tripId: string;
  sm: boolean | null;
  podeMarcar: boolean;
}) {
  const t = useTranslations("Programacao");
  const marcar = useMarcarSm(tripId);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  /*
    Fechar ao clicar fora, e o ouvinte só existe enquanto está aberto — mesma razão do status:
    quatrocentas linhas fechadas não podem deixar quatrocentos ouvintes no documento.
  */
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const SIM = "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
  const NAO = "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300";

  const rotulo = sm === null ? "SM" : sm ? t("smSim") : t("smNao");
  const classe =
    sm === null
      ? "text-muted-foreground/50 hover:text-foreground disabled:hover:text-muted-foreground/50"
      : sm
        ? SIM
        : NAO;

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        disabled={!podeMarcar}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={sm === null ? t("smPergunta") : rotulo}
        title={sm === null ? t("smPergunta") : rotulo}
        onClick={() => setAberto((v) => !v)}
        className={cn(
          "whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium uppercase leading-tight tracking-wide transition-colors",
          classe,
        )}
      >
        {rotulo}
      </button>

      {aberto ? (
        // `z-30` como o do status, e pelo mesmo motivo: quem abriu por último fica por cima.
        <div
          role="listbox"
          className="absolute left-0 z-30 mt-1 flex w-max flex-col gap-1 rounded-md border bg-background p-1.5 shadow-md"
        >
          <p className="px-1 pb-0.5 text-[10px] text-muted-foreground">{t("smPergunta")}</p>
          {[true, false].map((v) => {
            const marcado = sm === v;
            return (
              <button
                key={String(v)}
                type="button"
                role="option"
                aria-selected={marcado}
                onClick={() => {
                  // Clicar no que já está marcado DESMARCA — o mesmo gesto do status, e é o que as
                  // pessoas tentam. Sem ele, não haveria como tirar uma marcação posta por engano.
                  marcar.mutate(marcado ? null : v);
                  setAberto(false);
                }}
                className={cn(
                  "whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  v ? SIM : NAO,
                  marcado && "ring-2 ring-foreground/40 ring-offset-1 ring-offset-background",
                )}
              >
                {v ? t("smSim") : t("smNao")}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
