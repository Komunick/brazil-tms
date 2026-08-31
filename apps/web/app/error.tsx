"use client";

/* eslint-disable no-restricted-syntax -- TEXTO FIXO É REQUISITO AQUI, não descuido.
 *
 * A regra SC-006 exige `t()` do next-intl em todo JSX, e ela está certa em toda tela — menos nesta.
 * Uma tela de erro que depende do pipeline de tradução não aparece quando é o pipeline que falha, e
 * "MISSING_MESSAGE" no lugar da explicação é pior do que nenhuma tela.
 *
 * O custo é real e pequeno: a UI é pt-BR e existe UM único arquivo de mensagens no repositório
 * (`pt-BR.json`). No dia em que houver um segundo idioma, estas duas telas precisam de uma decisão
 * própria — provavelmente detectar o idioma do navegador, sem passar pelo next-intl.
 */

import { useEffect, useState } from "react";
import { deveRecarregar, esquecerRecarga } from "@/lib/ui/chunk-velho";

/**
 * A TELA DE ERRO DE UMA PÁGINA — e o conserto automático do chunk velho (2026-08-31).
 *
 * Cobre o que quebra DENTRO do layout. O irmão `global-error.tsx` cobre o que quebra no próprio
 * layout raiz, que é onde o "Application error" costuma nascer — os dois usam a mesma decisão, de
 * `lib/ui/chunk-velho.ts`, porque duas cópias divergiriam em silêncio.
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const [recarregando, setRecarregando] = useState(false);

  useEffect(() => {
    if (!deveRecarregar(error)) return;
    setRecarregando(true);
    /*
     * `location.reload()` e não `reset()`: o `reset` remonta a árvore com o MESMO JavaScript já
     * carregado, que é justamente o que está velho. Só uma ida ao servidor traz os nomes novos.
     */
    location.reload();
  }, [error]);

  useEffect(() => {
    if (recarregando) return;
    const t = setTimeout(esquecerRecarga, 5000);
    return () => clearTimeout(t);
  }, [recarregando]);

  if (recarregando) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-muted-foreground text-sm">Atualizando para a versão nova…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Algo deu errado nesta tela</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          O resto do sistema continua funcionando. Tente de novo — e se repetir, avise quem cuida do
          TMS com o horário.
        </p>
      </div>
      {/*
        A MENSAGEM CRUA fica à vista, e não escondida no console.

        Quem opera não abre o console do navegador. Sem o texto aqui, o relato que chega é "deu
        erro" — e a diferença entre um chunk velho e um defeito de verdade se perde, que foi
        exatamente o que custou meia hora em 31/08.
      */}
      <code className="bg-muted max-w-xl overflow-x-auto rounded px-3 py-2 text-left text-xs">
        {error.message || error.name}
      </code>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="border-input hover:bg-muted rounded border px-3 py-1.5 text-sm"
        >
          Tentar de novo
        </button>
        <button
          type="button"
          onClick={() => location.reload()}
          className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm"
        >
          Recarregar a página
        </button>
      </div>
    </div>
  );
}
