"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { STATUS_DA_PROGRAMACAO, type StatusDaProgramacao } from "@brazil-tms/shared";
import { APARENCIA_DO_STATUS } from "@/lib/trips/aparencia-do-status";
import { useMarcarStatus } from "@/lib/trips/client";
import { cn } from "@/lib/utils";

/**
 * O STATUS NA LINHA DA PROGRAMAÇÃO — a coluna que a planilha tem (2026-08-26, a pedido).
 *
 * ── POR QUE UMA CAIXINHA, E NÃO QUATRO BOTÕES NA LINHA ────────────────────────────────────────
 *
 * Foi o próprio pedido: "arranjar uma forma de não ficar muito grande a linha". Quatro botões fixos
 * por linha, numa tela de quatrocentas, seriam mil e seiscentos alvos de clique competindo com o
 * dado — e a coluna de rota e a de motorista, que é o que se lê, sairiam da primeira tela.
 *
 * Fechada, ocupa o tamanho da palavra. Aberta, é uma lista de quatro que se fecha ao escolher. É o
 * mesmo desenho da paleta de cores, que fica ao lado, e essa repetição é intencional: as duas
 * marcações da linha se comportam igual.
 *
 * ── O SELO MOSTRA O VALOR, E É ELE O BOTÃO ────────────────────────────────────────────────────
 *
 * Sem status, um traço apagado — discreto o bastante para não poluir a esmagadora maioria das
 * linhas, que não tem status nenhum. Com status, o próprio selo colorido, que é o que se lê de
 * relance numa coluna cheia.
 *
 * ── CLICAR NO QUE JÁ ESTÁ MARCADO DESMARCA ────────────────────────────────────────────────────
 *
 * É o gesto que as pessoas tentam, e sem ele não haveria como tirar um status posto por engano — a
 * alternativa seria um quinto item "sem status" na lista, que é um valor inventado para dizer
 * ausência.
 */
export function StatusDaLinha({
  tripId,
  status,
  podeMarcar,
}: {
  tripId: string;
  status: StatusDaProgramacao | null;
  podeMarcar: boolean;
}) {
  const t = useTranslations("Programacao");
  const marcar = useMarcarStatus(tripId);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  /**
   * FECHAR AO CLICAR FORA — e o ouvinte só existe enquanto está aberto.
   *
   * Registrado no `document` porque o clique que interessa acontece longe daqui. Amarrado ao
   * `aberto` para que quatrocentas linhas fechadas não deixem quatrocentos ouvintes no documento,
   * que é como uma tabela grande fica lenta sem ninguém entender por quê.
   */
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const aparencia = status ? APARENCIA_DO_STATUS[status] : null;

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        disabled={!podeMarcar}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={aparencia ? aparencia.rotulo : t("semStatus")}
        title={aparencia ? aparencia.rotulo : t("marcarStatus")}
        onClick={() => setAberto((v) => !v)}
        className={cn(
          "whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium uppercase leading-tight tracking-wide transition-colors",
          aparencia
            ? aparencia.classe
            : "text-muted-foreground/50 hover:text-foreground disabled:hover:text-muted-foreground/50",
        )}
      >
        {aparencia ? aparencia.rotulo : "—"}
      </button>

      {aberto ? (
        /**
         * `z-30` e não `z-20`: a paleta de cores, que fica ao lado, usa `z-20`. Se as duas caírem
         * abertas ao mesmo tempo — dá para abrir uma e depois a outra —, a de status precisa ficar
         * por cima, porque é a que acabou de ser aberta.
         */
        <div
          role="listbox"
          className="absolute left-0 z-30 mt-1 flex w-max flex-col gap-1 rounded-md border bg-background p-1.5 shadow-md"
        >
          {STATUS_DA_PROGRAMACAO.map((s) => {
            const a = APARENCIA_DO_STATUS[s];
            const marcado = status === s;
            return (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={marcado}
                onClick={() => {
                  // Clicar no que já está marcado DESMARCA.
                  marcar.mutate(marcado ? null : s);
                  setAberto(false);
                }}
                className={cn(
                  "whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  a.classe,
                  marcado && "ring-2 ring-foreground/40 ring-offset-1 ring-offset-background",
                )}
              >
                {a.rotulo}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
