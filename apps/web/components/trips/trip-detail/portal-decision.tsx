"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  MOTIVOS_DE_RECUSA,
  formatDateTime,
  impedimentoDaAcao,
  rotuloDoMotivo,
} from "@brazil-tms/shared";
import type { TripDetailView } from "@/lib/trips/trips-read";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

/**
 * DECIDIR A VIAGEM SEM ABRIR O PORTAL (2026-08-21, a pedido).
 *
 * A operação aceita e rejeita proposta o dia inteiro, e fazia isso em outra aba, num sistema que não
 * registra quem decidiu nem por quê. Eram 617 viagens esperando decisão.
 *
 * ── O QUE ACONTECE QUANDO SE APERTA ────────────────────────────────────────────────────────────
 *
 * Nada vai ao portal a partir deste clique. Quem tem sessão lá é o navegador da VM; o TMS grava uma
 * ORDEM e o robô a executa. Isso é encanamento e o cartão não o explica — mas ele TAMBÉM não mente
 * dizendo "aceita": enquanto a ordem está em voo, ele diz "enviando", e só vira "aceita" quando a
 * leitura seguinte trouxer o portal concordando.
 *
 * Essa distinção é o cartão inteiro. Um botão que pisca "pronto" e depois volta atrás em silêncio é
 * pior do que não ter botão: ensina a não confiar na tela.
 *
 * ── QUANDO ELE NÃO APARECE ─────────────────────────────────────────────────────────────────────
 *
 * Some quando não há decisão a tomar — viagem já aceita, ou que nunca passou pelo portal. Um cartão
 * permanentemente cinza em toda viagem seria ruído em 5.000 telas para servir a 617.
 */
export function PortalDecisionPanel({ trip }: { trip: TripDetailView }) {
  const t = useTranslations("Trips.portalDecision");
  const [motivo, setMotivo] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  /**
   * O QUE ESTÁ SENDO DECIDIDO AGORA — nada, aceite, ou recusa (2026-08-21, a pedido).
   *
   * O aceite ganhou confirmação depois que a recusa já tinha: os dois são irreversíveis do nosso
   * lado. Uma vez que o portal registra, desfazer é conversa com o cliente, não um botão. Um clique
   * solitário numa lista de 617 linhas é fácil demais de dar sem querer.
   */
  const [modo, setModo] = useState<null | "accept" | "reject">(null);
  const acao = usePortalAction(trip.id);

  const campos = (trip.customerFields ?? {}) as Record<string, string>;
  const ordem = trip.portalCommand;
  const emVoo = ordem?.status === "pending" || ordem?.status === "sent";
  const impedimento = impedimentoDaAcao({
    acceptanceStatus: campos["Aceitação (portal)"],
    portalTripId: campos["ID (portal)"],
    temOrdemAberta: emVoo,
  });

  /**
   * Some quando a viagem não está esperando decisão — mas FICA quando o impedimento é uma ordem em
   * voo ou a falta do id: nesses dois casos há algo a dizer, e sumir seria esconder justamente o
   * estado que gera a pergunta "cadê o botão?".
   */
  if (impedimento === "nao_esta_pendente" && !ordem) return null;

  const erro = acao.error instanceof TripsError ? acao.error.message : null;

  /** Fechar a recusa limpa o que foi digitado: reabrir tem de começar do zero, não do meio. */
  const fechar = () => {
    setModo(null);
    setMotivo("");
    setObservacao("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("hint")}</p>

        {ordem ? <EstadoDaOrdem ordem={ordem} t={t} /> : null}

        {impedimento === "sem_id_do_portal" ? (
          <p className="text-sm text-muted-foreground">{t("noPortalId")}</p>
        ) : null}

        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}

        {impedimento === null && modo === null ? (
          <div className="flex flex-wrap gap-2">
            <Button disabled={acao.isPending} onClick={() => setModo("accept")}>
              {t("accept")}
            </Button>
            <Button variant="outline" disabled={acao.isPending} onClick={() => setModo("reject")}>
              {t("reject")}
            </Button>
          </div>
        ) : null}

        {/**
         * A CONFIRMAÇÃO É UM CARD QUE PARA A TELA (2026-08-21, a pedido).
         *
         * Um bloco embutido continua sendo parte da página, e numa página que a pessoa já estava
         * varrendo com o olho ele vira mais uma coisa a rolar. O modal tira a decisão do fluxo: ele
         * existe para forçar meio segundo de leitura entre o clique e o irreversível.
         *
         * E ele diz o NÚMERO DA LH em voz alta. "Você tem certeza?" sozinho não protege de nada — quem
         * clicou errado clica "sim" com a mesma convicção. O que revela o engano é ler qual viagem é.
         */}
        <Dialog
          open={modo === "accept"}
          onOpenChange={(aberto) => setModo(aberto ? "accept" : null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("confirmTitle")}</DialogTitle>
              <DialogDescription>
                {t("confirmAcceptQuestion", { lh: trip.externalTripId ?? trip.id })}
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t("noUndo")}</p>
            <DialogFooter>
              <Button variant="ghost" disabled={acao.isPending} onClick={() => setModo(null)}>
                {t("cancel")}
              </Button>
              <Button
                disabled={acao.isPending}
                onClick={() => acao.mutate({ action: "accept", reasonId: null, remark: null })}
              >
                {t("confirmAccept")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/**
         * A RECUSA PEDE MOTIVO, e não por escolha nossa: o portal não aceita rejeição sem um dos ids
         * que ele serve. Perguntar aqui é o que evita mandar a ordem para receber a recusa três
         * saltos adiante, quando quem decidiu já saiu da tela.
         *
         * Ela mora no mesmo card modal do aceite — a pergunta é a mesma, e a resposta também não tem
         * volta. A diferença é que aqui a confirmação já vem com o que o portal exige.
         */}
        <Dialog
          open={modo === "reject"}
          onOpenChange={(aberto) => (aberto ? setModo("reject") : fechar())}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("confirmTitle")}</DialogTitle>
              <DialogDescription>
                {t("confirmRejectQuestion", { lh: trip.externalTripId ?? trip.id })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="motivo-recusa">{t("reasonLabel")}</Label>
                <Select value={motivo} onValueChange={setMotivo}>
                  <SelectTrigger id="motivo-recusa">
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
                <Label htmlFor="obs-recusa">{t("remarkLabel")}</Label>
                <Textarea
                  id="obs-recusa"
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
                  acao.mutate({
                    action: "reject",
                    reasonId: Number(motivo),
                    remark: observacao.trim() || null,
                  })
                }
              >
                {t("confirmReject")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/**
 * O estado da última decisão, em uma linha.
 *
 * `failed` mostra o erro do portal INTEIRO, sem resumir: é a única pista que sobra, e um "falhou"
 * genérico obrigaria a abrir o portal — o passo que este recurso existe para eliminar.
 */
function EstadoDaOrdem({
  ordem,
  t,
}: {
  ordem: NonNullable<TripDetailView["portalCommand"]>;
  t: (k: string, v?: Record<string, string>) => string;
}) {
  const acao = t(ordem.action === "accept" ? "actionAccept" : "actionReject");
  const quando = formatDateTime(ordem.requestedAt);
  const estilo =
    ordem.status === "failed"
      ? "border-destructive/50 text-destructive"
      : ordem.status === "done"
        ? "border-success/50 text-success"
        : "border-warning/50 text-warning";

  return (
    <div className={`space-y-1 rounded border px-3 py-2 text-sm ${estilo}`}>
      <p className="font-medium">{t(`status_${ordem.status}`, { action: acao })}</p>
      <p className="text-xs text-muted-foreground">
        {t("requestedAt", { when: quando })}
        {ordem.reasonId ? ` · ${rotuloDoMotivo(ordem.reasonId) ?? ""}` : ""}
        {ordem.remark ? ` · ${ordem.remark}` : ""}
      </p>
      {ordem.status === "failed" && ordem.lastError ? (
        <p className="text-xs">{ordem.lastError}</p>
      ) : null}
    </div>
  );
}
