"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MessageSquare } from "lucide-react";
import { ComentariosDaViagem } from "@/components/trips/comentarios-da-viagem";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * O RECADO SEM ABRIR A LH (2026-08-26, a pedido).
 *
 * A primeira versão punha um marcador na linha que, ao ser clicado, abria a janela inteira da
 * viagem — e a conversa ficava no rodapé dela, depois da linha do tempo. O usuário apontou o custo:
 * para ler um recado de uma linha, era preciso abrir a viagem, rolar até o fim, ler, fechar. Vezes
 * quarenta linhas numa manhã.
 *
 * Agora o marcador abre uma janela pequena com a conversa e o campo de escrever, e nada mais.
 *
 * ── O MARCADOR APARECE MESMO COM ZERO ─────────────────────────────────────────────────────────
 *
 * Antes ele só existia quando havia comentário — e aí não havia por onde escrever o PRIMEIRO sem
 * abrir a LH, que é exatamente o caminho que este componente veio encurtar. Sem comentários ele
 * fica apagado e sem número; com, ganha cor e a contagem.
 *
 * ── É `Dialog`, E NÃO UM BALÃO ANCORADO NA LINHA ──────────────────────────────────────────────
 *
 * Um balão ancorado ficaria preso dentro da tabela, que rola nos dois eixos: abrir na última linha
 * o deixaria metade fora da tela, e rolar a tabela o arrastaria junto ou o descolaria. A janela
 * pequena é previsível, fecha com Esc, e o quadro continua atrás.
 */
export function ComentariosDaLinha({
  tripId,
  externalTripId,
  quantos,
  userId,
}: {
  tripId: string;
  externalTripId: string | null;
  quantos: number;
  userId: string;
}) {
  const t = useTranslations("Programacao");
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title={quantos > 0 ? t("temComentarios", { n: quantos }) : t("comentar")}
        className={cn(
          "ml-1.5 inline-flex items-center gap-0.5 align-middle transition-colors",
          quantos > 0
            ? "text-foreground/70 hover:text-foreground"
            : "text-muted-foreground/40 hover:text-foreground",
        )}
      >
        <MessageSquare className="h-3 w-3" aria-hidden />
        {quantos > 0 ? <span className="text-[10px] tabular-nums">{quantos}</span> : null}
        <span className="sr-only">
          {quantos > 0 ? t("temComentarios", { n: quantos }) : t("comentar")}
        </span>
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{externalTripId ?? "—"}</DialogTitle>
            <DialogDescription>{t("comentarioVisivelATodos")}</DialogDescription>
          </DialogHeader>
          {/*
            A MESMA lista da janela da viagem, e não uma cópia enxuta: escrever, apagar e ordenar
            são as mesmas regras nos dois lugares, e duas implementações divergiriam no mês seguinte.
            Aqui ela é o conteúdo inteiro; lá, uma seção no fim.
          */}
          <ComentariosDaViagem tripId={tripId} userId={userId} semTitulo />
        </DialogContent>
      </Dialog>
    </>
  );
}
