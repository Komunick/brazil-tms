"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MOTIVOS_DE_RECUSA } from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TripsError, usePortalAction } from "@/lib/trips/client";
import { PortalOrderStatus } from "@/components/trips/portal-order-status";

/**
 * ACEITAR E RECUSAR, onde a operação estiver (2026-08-21, a pedido).
 *
 * Nasceu dentro do cartão da viagem e saiu de lá no mesmo dia, quando a fila de Expedição passou a
 * precisar dos mesmos dois botões. Duas telas com a mesma decisão irreversível não podem ter duas
 * confirmações escritas separadamente — a segunda é a que esquece de perguntar.
 *
 * Ele não sabe se pode agir: quem decide isso é quem o desenha, com o dado que tem em mãos (a lista
 * tem a aceitação na linha; o cartão tem a viagem inteira). Aqui mora só o fluxo — confirmar,
 * mandar, e dizer o que deu errado.
 */
export function PortalDecisionButtons({
  tripId,
  externalTripId,
  tamanho = "default",
}: {
  tripId: string;
  /** O número da LH, para a confirmação dizer em voz alta qual viagem está sendo decidida. */
  externalTripId: string | null;
  tamanho?: "default" | "sm";
}) {
  const t = useTranslations("Trips.portalDecision");
  const [modo, setModo] = useState<null | "accept" | "reject">(null);
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const acao = usePortalAction(tripId);

  const lh = externalTripId ?? tripId;
  const erro = acao.error instanceof TripsError ? acao.error.message : null;

  /** Fechar limpa o que foi digitado: reabrir tem de começar do zero, não do meio. */
  const fechar = () => {
    setModo(null);
    setMotivo("");
    setObservacao("");
  };

  /**
   * DEPOIS DE MANDAR, OS BOTÕES SOMEM DESTA LINHA.
   *
   * A viagem só sai de "Em análise" quando a leitura seguinte trouxer o portal concordando — até lá
   * a linha continua na fila, com a mesma cara. Sem isto, o caminho natural é clicar de novo, receber
   * a recusa de "já existe uma decisão em voo" e desconfiar de que o primeiro clique não pegou.
   *
   * O servidor recusa a segunda de qualquer jeito; isto é para a pessoa não precisar descobrir isso
   * por um erro.
   */
  if (acao.isSuccess) {
    /**
     * E agora ele SEGUE a ordem em vez de congelar em "enviando".
     *
     * "Enviando" era verdade por poucos segundos e mentira depois: a palavra ficava ali igual
     * tivesse o portal aceitado, recusado, ou nunca respondido. Quem lia não tinha como saber em
     * qual dos três casos estava.
     */
    return <PortalOrderStatus tripId={tripId} />;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size={tamanho}
          disabled={acao.isPending}
          onClick={() => setModo("accept")}
        >
          {t("accept")}
        </Button>
        <Button
          type="button"
          size={tamanho}
          variant="outline"
          disabled={acao.isPending}
          onClick={() => setModo("reject")}
        >
          {t("reject")}
        </Button>
        {erro ? (
          <span role="alert" className="text-xs text-destructive">
            {erro}
          </span>
        ) : null}
      </div>

      {/**
       * A CONFIRMAÇÃO É UM CARD QUE PARA A TELA.
       *
       * E ela diz o NÚMERO DA LH em voz alta. "Você tem certeza?" sozinho não protege de nada — quem
       * clicou errado clica "sim" com a mesma convicção. O que revela o engano é ler qual viagem é —
       * e numa lista de dezenas de linhas parecidas, é a única defesa que existe.
       */}
      <Dialog
        open={modo === "accept"}
        onOpenChange={(aberto) => (aberto ? setModo("accept") : fechar())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTitle")}</DialogTitle>
            <DialogDescription>{t("confirmAcceptQuestion", { lh })}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("noUndo")}</p>
          <DialogFooter>
            <Button variant="ghost" disabled={acao.isPending} onClick={fechar}>
              {t("cancel")}
            </Button>
            <Button
              disabled={acao.isPending}
              onClick={() =>
                acao.mutate(
                  { action: "accept", reasonId: null, remark: null },
                  { onSuccess: fechar },
                )
              }
            >
              {t("confirmAccept")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/**
       * A RECUSA PEDE MOTIVO, e não por escolha nossa: o portal não aceita rejeição sem um dos ids
       * que ele serve. Perguntar aqui evita mandar a ordem para receber a recusa três saltos adiante,
       * quando quem decidiu já saiu da tela.
       */}
      <Dialog
        open={modo === "reject"}
        onOpenChange={(aberto) => (aberto ? setModo("reject") : fechar())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTitle")}</DialogTitle>
            <DialogDescription>{t("confirmRejectQuestion", { lh })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`motivo-${tripId}`}>{t("reasonLabel")}</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger id={`motivo-${tripId}`}>
                  <SelectValue placeholder={t("reasonPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVOS_DE_RECUSA.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`obs-${tripId}`}>{t("remarkLabel")}</Label>
              <Textarea
                id={`obs-${tripId}`}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                maxLength={500}
                rows={2}
              />
            </div>
            <p className="text-sm text-muted-foreground">{t("noUndo")}</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={acao.isPending} onClick={fechar}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={acao.isPending || motivo === ""}
              onClick={() =>
                acao.mutate(
                  {
                    action: "reject",
                    reasonId: Number(motivo),
                    remark: observacao.trim() || null,
                  },
                  { onSuccess: fechar },
                )
              }
            >
              {t("confirmReject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
