"use client";

import { useTranslations } from "next-intl";
import { formatDateTime, impedimentoDaAcao, rotuloDoMotivo } from "@brazil-tms/shared";
import type { TripDetailView } from "@/lib/trips/trips-read";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalDecisionButtons } from "@/components/trips/portal-decision-buttons";

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

        {/**
         * OS BOTÕES SÃO OS MESMOS DA FILA DE EXPEDIÇÃO.
         *
         * Duas telas com a mesma decisão irreversível não podem ter duas confirmações escritas
         * separadamente — a segunda é sempre a que esquece de perguntar.
         */}
        {impedimento === null ? (
          <PortalDecisionButtons tripId={trip.id} externalTripId={trip.externalTripId} />
        ) : null}
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
