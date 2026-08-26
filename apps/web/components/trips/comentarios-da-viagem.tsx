"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { useApagarComentario, useComentar, useComentarios } from "@/lib/trips/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * OS COMENTÁRIOS DA VIAGEM — o recado que fica (2026-08-26, a pedido).
 *
 * "Cliente pediu para adiantar", "motorista avisou que atrasa uma hora", "carreta trocada na
 * origem". Hoje isso vive no WhatsApp e some no dia seguinte; quem entra no turno seguinte não tem
 * como saber. Aqui mora na viagem e é de todos.
 *
 * ── O AVISO É O MARCADOR NA LINHA, e não um sino ──────────────────────────────────────────────
 *
 * Decisão do usuário, e a alternativa foi considerada: virar aviso na superfície de alertas, com
 * "dar ciência". Um comentário não é uma tarefa pendente — transformá-lo numa faria a operação
 * aprender a fechar avisos sem ler, e é essa a superfície que precisa continuar valendo.
 *
 * O marcador na linha da programação chega a quem está olhando aquela LH, que é exatamente quem
 * precisa do recado.
 *
 * ── DO MAIS RECENTE PARA O MAIS ANTIGO ────────────────────────────────────────────────────────
 *
 * Ao contrário de um chat. A pergunta aqui é "o que há de novo nesta viagem", e a resposta tem de
 * estar na primeira linha; quem quiser o histórico rola.
 */
export function ComentariosDaViagem({ tripId, userId }: { tripId: string; userId: string }) {
  const t = useTranslations("Programacao");
  const consulta = useComentarios(tripId);
  const enviar = useComentar(tripId);
  const apagar = useApagarComentario(tripId);
  const [texto, setTexto] = useState("");

  const itens = consulta.data?.itens ?? [];
  const podeEnviar = texto.trim() !== "" && !enviar.isPending;

  return (
    <section aria-label={t("comentarios")} className="space-y-2">
      <h3 className="text-sm font-medium">
        {t("comentarios")}
        {itens.length > 0 ? (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">{itens.length}</span>
        ) : null}
      </h3>

      <div className="space-y-1.5">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={t("comentarioPlaceholder")}
          rows={2}
          maxLength={2000}
          /**
           * CTRL+ENTER ENVIA, ENTER QUEBRA LINHA.
           *
           * O contrário — Enter enviando — é o que um chat faz, e é o certo lá porque a mensagem é
           * curta. Aqui o recado tem duas ou três linhas ("cliente pediu para adiantar, falei com o
           * Marcelo, ele confirma às 14h"), e Enter enviando cortaria o texto no meio da primeira
           * ideia. O atalho existe para quem digita rápido; o botão continua ali para todo mundo.
           */
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && podeEnviar) {
              e.preventDefault();
              enviar.mutate(texto.trim(), { onSuccess: () => setTexto("") });
            }
          }}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!podeEnviar}
            onClick={() => enviar.mutate(texto.trim(), { onSuccess: () => setTexto("") })}
          >
            {enviar.isPending ? t("comentando") : t("comentar")}
          </Button>
          <span className="text-xs text-muted-foreground">{t("comentarioVisivelATodos")}</span>
        </div>
      </div>

      {itens.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("semComentarios")}</p>
      ) : (
        <ul className="space-y-2">
          {itens.map((c) => (
            <li key={c.id} className="rounded-md border bg-muted/30 px-3 py-2">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium">{c.autor ?? t("autorDesconhecido")}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {quando(c.criadoEm)}
                </span>
                {/*
                  APAGAR SÓ APARECE PARA O AUTOR — e quem garante isso é o servidor, dentro do
                  `where` que apaga. Esconder o botão aqui é conveniência; a regra mora lá, e é lá
                  que ela continua valendo para qualquer caminho que alguém escreva depois.
                */}
                {c.autorUserId === userId ? (
                  <button
                    type="button"
                    aria-label={t("apagarComentario")}
                    title={t("apagarComentario")}
                    disabled={apagar.isPending}
                    onClick={() => apagar.mutate(c.id)}
                    className="ml-auto rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                  </button>
                ) : null}
              </div>
              {/* `whitespace-pre-wrap`: quem escreveu em três linhas quis três linhas. */}
              <p className="whitespace-pre-wrap text-xs">{c.texto}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A hora em São Paulo, como a operação lê.
 *
 * Dia e hora, sem o ano: um comentário de viagem é de hoje ou de ontem, e o ano ocuparia espaço
 * numa linha que já é estreita para dizer o que ninguém precisa.
 */
function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
