"use client";

import { useEffect, useRef, useState } from "react";
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

  /*
    ── PISCA PELO QUE CHEGOU, NÃO PELO QUE EXISTE (2026-09-04, a pedido) ─────────────────────────

    O pedido foi "que chame atenção quando alguém comenta". A leitura fácil seria piscar sempre que
    houvesse comentário — e seria o erro: numa manhã comum dezenas de linhas têm recado, o quadro
    inteiro passaria a piscar, e o que pisca sempre some da vista igual ao que não pisca nunca.

    Então a memória é da CONTAGEM: guarda quantos havia e acende quando o número cresce.

    ── A PRIMEIRA LEITURA NUNCA ACENDE ─────────────────────────────────────────────────────────

    `vistos` nasce com o que a linha já trazia. Sem isso, abrir a tela de manhã faria acender tudo
    que tem recado desde ontem — é a mesma armadilha que o aviso de oferta de spot documenta com o
    seu `estadoInicial`, e pela mesma razão: "novo para mim agora" não é "existe".

    ── E APAGA AO ABRIR ────────────────────────────────────────────────────────────────────────

    Quem abriu, leu. Manter aceso depois disso ensinaria a ignorar o sinal, que é o defeito que este
    componente veio consertar.
  */
  const vistos = useRef(quantos);
  const [chegou, setChegou] = useState(false);

  useEffect(() => {
    if (quantos > vistos.current) setChegou(true);
    vistos.current = quantos;
  }, [quantos]);

  useEffect(() => {
    if (aberto) setChegou(false);
  }, [aberto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title={quantos > 0 ? t("temComentarios", { n: quantos }) : t("comentar")}
        className={cn(
          "ml-1.5 inline-flex items-center gap-0.5 rounded-full align-middle transition-colors",
          /*
            FUNDO PRÓPRIO quando há recado — e é isto que o faz aparecer.

            Antes ele herdava a cor do texto da linha, e a linha é pintada pela cor de marcação: o
            sinal se diluía no próprio fundo. Com fundo opaco ele SOBREPÕE a cor em vez de competir
            com ela, que foi o pedido.
          */
          quantos > 0
            ? "bg-foreground px-1.5 py-0.5 font-bold text-background"
            : "text-muted-foreground/40 hover:text-foreground",
          // Chegou recado agora: laranja da marca, com o anel pulsando. Ver `globals.css`.
          chegou && "animate-recado-chamando bg-[#EE4D2D] text-white",
        )}
      >
        <MessageSquare className={cn("h-3 w-3", quantos > 0 && "h-3.5 w-3.5")} aria-hidden />
        {quantos > 0 ? <span className="text-[11px] tabular-nums">{quantos}</span> : null}
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
