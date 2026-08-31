"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * COPIAR UM VALOR DA LINHA (2026-08-31, a pedido).
 *
 * A programação existe para substituir a planilha, e boa parte do trabalho de quem a usa é LEVAR um
 * dado daqui para outro lugar — a LH para o portal, o CPF para a tela da gerenciadora, o telefone
 * para o WhatsApp. Sem botão, isso é selecionar com o mouse num texto de 11px dentro de uma tabela
 * com quinze colunas, e errar um dígito de CPF é o tipo de erro que só aparece lá na frente.
 *
 * ── APARECE NO HOVER, MAS EXISTE SEMPRE ───────────────────────────────────────────────────────
 *
 * `opacity-0` e não `hidden`: o botão continua no fluxo, então a linha não pula de largura quando o
 * mouse passa — e continua alcançável pelo teclado, que é o que um `hidden` tiraria.
 *
 * No celular não há hover, e o `focus-within` do grupo resolve: um toque revela.
 *
 * ── A CONFIRMAÇÃO É O PRÓPRIO ÍCONE ───────────────────────────────────────────────────────────
 *
 * Vira um "check" por dois segundos. Um aviso flutuante para uma ação tão pequena seria mais
 * interrupção do que informação — e quem copia cinco campos seguidos teria cinco avisos na tela.
 */
export function Copiar({
  valor,
  rotulo,
  className,
}: {
  valor: string;
  /** O que está sendo copiado, para quem usa leitor de tela: "Copiar CPF". */
  rotulo: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      onClick={(e) => {
        /*
         * `stopPropagation` porque a linha inteira é clicável — abre o detalhe da viagem. Sem isto,
         * copiar o CPF abriria a viagem junto, e a pessoa perderia o lugar na lista.
         */
        e.stopPropagation();
        /*
         * `catch` silencioso: a área de transferência exige contexto seguro e permissão, e um erro
         * aqui não pode derrubar a linha. Quando falha, o ícone simplesmente não vira check — e a
         * pessoa ainda pode selecionar o texto à mão, como fazia antes.
         */
        navigator.clipboard
          ?.writeText(valor)
          .then(() => setCopiado(true))
          .catch(() => {});
      }}
      className={cn(
        "text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center align-middle opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
        copiado && "text-emerald-600 opacity-100 dark:text-emerald-400",
        className,
      )}
    >
      {copiado ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );
}
