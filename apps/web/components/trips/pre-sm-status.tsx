"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import type { PreSmDaViagem } from "@brazil-tms/db";
import { formatDateTime } from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { avisar } from "@/lib/ui/avisos";
import { cn } from "@/lib/utils";

/**
 * A PRÉ-SM DESTA VIAGEM (2026-08-25, fatia 026).
 *
 * Mostra o que aconteceu com a solicitação de monitoramento na gerenciadora Logae — e,
 * principalmente, **por que ela não foi criada** quando não foi.
 *
 * ── O SILÊNCIO É O DESFECHO QUE ISTO EVITA ────────────────────────────────────────────────────
 *
 * Sem esta tela, uma viagem sem CPF ficaria idêntica a uma viagem que ninguém processou. A operação
 * passaria a achar que a Pré-SM foi criada quando não foi — o que é pior do que não ter a feature,
 * porque troca um trabalho manual conhecido por uma confiança errada.
 *
 * ── OS ESTADOS DIZEM COISAS DIFERENTES, E CADA UM MANDA A UM LUGAR ────────────────────────────
 *
 *   `sem_dados`  problema NOSSO — falta CPF, modelo ou vínculo. O motivo diz onde resolver.
 *   `recusada`   resposta DELA — a mensagem vai inteira, sem tradução nossa (FR-014).
 *   `pendente`   ou está esperando a vez, ou a integração está desligada. Nada a fazer.
 *   `criada`     existe lá, com número. Cancelável.
 *   `cancelada`  desfeita. A viagem pode gerar outra.
 *
 * Juntar `sem_dados` e `recusada` num "falhou" mandaria a pessoa procurar no lugar errado metade
 * das vezes.
 */
export function PreSmStatus({ tripId }: { tripId: string }) {
  const t = useTranslations("PreSm");
  const qc = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);

  const consulta = useQuery({
    queryKey: ["pre-sm", tripId],
    queryFn: async () => {
      const res = await fetch(`/api/trips/${tripId}/pre-sm`);
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as {
        preSm: PreSmDaViagem | null;
        divergencias: ("motorista" | "placas")[];
      };
    },
    // O estado muda por fora — o worker é quem cria e quem cancela. Sem polling, a tela ficaria
    // dizendo "pendente" para sempre depois de um cancelamento pedido.
    refetchInterval: 15_000,
  });

  const cancelar = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/trips/${tripId}/pre-sm`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: () => {
      setConfirmando(false);
      void qc.invalidateQueries({ queryKey: ["pre-sm", tripId] });
      // "Pedido", não "cancelada": quem cancela de verdade é a gerenciadora, e a confirmação vem
      // depois. Dizer "cancelada" agora seria mentir sobre algo que continua ativo e cobrado.
      avisar({ tipo: "ok", texto: t("cancelamentoPedido") });
    },
    onError: () => avisar({ tipo: "erro", texto: t("cancelamentoFalhou") }),
  });

  const preSm = consulta.data?.preSm;
  const divergencias = consulta.data?.divergencias ?? [];

  // Sem nenhuma linha, a viagem nunca chegou ao ponto de gerar Pré-SM — o que é o normal para quem
  // ainda não foi atribuída. Um bloco vazio aqui viraria ruído em toda viagem do quadro.
  if (!preSm) return null;

  const criada = preSm.status === "criada";
  const problema = preSm.status === "sem_dados" || preSm.status === "recusada";

  return (
    <section className="space-y-1.5 rounded-md border p-3" aria-label={t("titulo")}>
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck
          className={cn("h-4 w-4", criada ? "text-success" : problema ? "text-destructive" : "text-muted-foreground")}
          aria-hidden
        />
        <span className="text-sm font-medium">{t("titulo")}</span>
        <span
          className={cn(
            "text-xs",
            criada ? "text-success" : problema ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {t(`status.${preSm.status}`)}
        </span>
        {preSm.codigo ? (
          <span className="font-mono text-xs tabular-nums">{preSm.codigo}</span>
        ) : null}
        {criada ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setConfirmando(true)}
          >
            {t("cancelar")}
          </Button>
        ) : null}
      </div>

      {/* O motivo é o que faz a tela servir para alguma coisa quando nada foi criado. Em `recusada`
          ele é a mensagem DELA, sem tradução — traduzir esconderia o código que ela usa para
          identificar o problema. */}
      {preSm.motivo ? (
        <p className="text-xs text-muted-foreground">
          {preSm.status === "sem_dados" ? t(`motivo.${preSm.motivo}`) : preSm.motivo}
        </p>
      ) : null}

      {/**
       * A DIVERGÊNCIA (FR-018): a atribuição mudou depois da Pré-SM criada.
       *
       * A escolta está esperando quem constava na criação, e a viagem vai sair com outra pessoa ou
       * outro veículo. Alterar a Pré-SM existente ficou fora desta fatia, então o que dá para fazer
       * é dizer — e dizer em vermelho, porque isto é diferente dos outros textos deste bloco: os
       * outros descrevem um estado, este pede uma ação fora do sistema.
       */}
      {divergencias.length > 0 ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {t("divergencia", { o: divergencias.map((d) => t(`divergencias.${d}`)).join(" e ") })}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {preSm.settledAt
          ? t("em", { data: formatDateTime(preSm.settledAt) })
          : t("pedidaEm", { data: formatDateTime(preSm.requestedAt) })}
      </p>

      {/**
       * O cancelamento pede confirmação, e o texto diz o que está em jogo.
       *
       * A gerenciadora cobra por solicitação: a Pré-SM que se está cancelando JÁ FOI paga, e o
       * cancelamento não devolve isso. Um diálogo genérico de "tem certeza?" não daria essa
       * informação, que é justamente a que faz alguém parar e pensar.
       */}
      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cancelarTitulo")}</DialogTitle>
            <DialogDescription>{t("cancelarAviso")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmando(false)}>
              {t("voltar")}
            </Button>
            <Button
              variant="destructive"
              disabled={cancelar.isPending}
              onClick={() => cancelar.mutate()}
            >
              {t("cancelarConfirmar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
