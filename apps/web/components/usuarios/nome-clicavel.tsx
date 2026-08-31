"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslations } from "next-intl";
import { MiniPerfil } from "@/components/usuarios/mini-perfil";

/**
 * O NOME DE UMA PESSOA VIRA CLICÁVEL (fatia 029, US2 · FR-018).
 *
 * ── POR QUE DIÁLOGO, E NÃO POPOVER ────────────────────────────────────────────────────────────
 *
 * Um popover seria melhor: a pergunta é de passagem — "quem é essa pessoa?" no meio de outra tarefa
 * — e um cartão ao lado interrompe menos que um modal.
 *
 * Só que não existe componente de popover neste repositório, e trazê-lo custaria
 * `@radix-ui/react-popover`: dependência nova para um cartão, contra o princípio I e contra o que o
 * plano desta fatia diz (nenhuma dependência nova). O `Dialog` já está aqui e já é o que o TMS usa
 * para janelas pequenas — a do previsto, a de atribuição.
 *
 * Fica registrado como o que se perde, e não como o que se preferiu: se um popover aparecer no
 * repositório por outro motivo, este é o primeiro lugar a trocar.
 *
 * ── SÓ BUSCA QUANDO ABRE ──────────────────────────────────────────────────────────────────────
 *
 * O `MiniPerfil` só é montado com o diálogo aberto. Numa lista de trinta linhas, montá-lo sempre
 * dispararia trinta consultas para desenhar cartões que ninguém pediu.
 *
 * ── NÃO É LINK ────────────────────────────────────────────────────────────────────────────────
 *
 * Não há página de perfil para onde ir, e um `a` sem destino é promessa que a tela não cumpre: abre
 * em nova aba pelo clique do meio, aparece no menu de contexto como "copiar endereço". É botão.
 */
export function NomeClicavel({
  userId,
  nome,
  className,
}: {
  userId: string;
  nome: string;
  className?: string;
}) {
  const t = useTranslations("Perfil");
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        className={
          className ??
          "rounded text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        }
        onClick={(e) => {
          // A linha da tabela costuma abrir a viagem — sem isto, o clique acionaria os dois.
          e.stopPropagation();
          setAberto(true);
        }}
      >
        {nome}
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("titulo")}</DialogTitle>
          </DialogHeader>
          {/* Montado só com o diálogo aberto — ver o comentário do topo. */}
          {aberto ? <MiniPerfil userId={userId} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
