"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@brazil-tms/shared";
import {
  TripsError,
  useAcknowledgeAlert,
  useAlerts,
  useUnacknowledgeAlert,
} from "@/lib/trips/client";
import { groupAlertsByTrip, paginate } from "@/lib/alerts/group-by-trip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * In-app alert surface (007, US4). Lists the open §17 alerts with an acknowledge action; the
 * acknowledged ones are behind a toggle (2026-08-15), greyed, naming who silenced each and when, and
 * undoable. Mounted on the Control-Tower board + Home Dashboard; polled on the control-tower
 * cadence. In-app only — nothing leaves the app (FR-025). pt-BR.
 *
 * UMA LINHA POR VIAGEM, não por alerta (2026-08-16).
 *
 * A lista era plana e contava alertas. Medido na operação real: 307 alertas em 123 viagens — 75
 * delas com TRÊS. E os três dizem a mesma coisa: não foi atribuída, não chegou na origem, não
 * chegou no destino, porque o caminhão não saiu. Um problema, contado três vezes.
 *
 * Ninguém trata isso como três pendências, então a tela parava de ajudar exatamente quando mais
 * precisava — no dia cheio. Agora a viagem é a linha, os tipos viram etiquetas dentro dela, e o
 * número no topo é quantas VIAGENS pedem atenção. O total de alertas continua visível ao lado, para
 * quem quiser a conta antiga.
 *
 * Reconhecer também passa a ser por viagem: silencia os alertas ativos daquela viagem de uma vez, e
 * desfazer devolve todos. É o gesto que a pessoa já faz — "essa eu vi" —, e não um clique por
 * sintoma.
 */

const SEVERITY_CLASS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/15 text-warning",
  high: "bg-destructive/15 text-destructive",
};

/** Quantas viagens por página. Oito cabem sem rolar em qualquer tela. */
const GRUPOS_POR_PAGINA = 8;


export function AlertSurface() {
  const t = useTranslations("Alerts");
  /**
   * The surface leads with the ACTIVE alerts: acknowledging silences one until its condition clears,
   * so keeping it in the working list would defeat the point (D3). But acknowledging used to make it
   * vanish with no trace anywhere in the app — a one-way door, with no way to check what the team had
   * already triaged and no way back from a misclick. The acknowledged ones are now one click away,
   * greyed, each naming who silenced it and when, each undoable.
   */
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [pagina, setPagina] = useState(1);
  const query = useAlerts(showAcknowledged ? {} : { state: "active" });
  const acknowledge = useAcknowledgeAlert();
  const unacknowledge = useUnacknowledgeAlert();

  const items = query.data?.items ?? [];
  const groups = groupAlertsByTrip(items);

  /**
   * A lista vira PÁGINAS (2026-08-17).
   *
   * Mesmo com uma linha por viagem, 127 viagens é uma parede de rolagem — e no quadro da Torre os
   * avisos ficam ACIMA das viagens, então quem clicava num status no painel do dia caía no topo e
   * tinha de rolar a lista inteira até chegar nas LH. O problema não era achar o aviso, era
   * atravessá-los.
   *
   * Oito por vez cabem sem rolar em qualquer tela, e a página some sozinha quando há uma só.
   */
  const { visiveis, paginaAtual, totalPaginas } = paginate(groups, pagina, GRUPOS_POR_PAGINA);
  // O número que importa: quantas VIAGENS pedem atenção. O total de alertas fica ao lado.
  const activeTripCount = groups.filter((g) => g.activeItems.length > 0).length;
  const activeAlertCount = items.filter((a) => a.state === "active").length;
  const acknowledgedCount = items.length - activeAlertCount;

  const mapError = (e: unknown): string => {
    const code = e instanceof TripsError ? e.code : "REQUEST_FAILED";
    try {
      return t(`errors.${code}` as Parameters<typeof t>[0]);
    } catch {
      return t("errors.REQUEST_FAILED");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("surfaceTitle")}</CardTitle>
        <div className="flex items-center gap-3">
          {/* Conta sempre as ATIVAS, com ou sem o botão ligado: é o tamanho da pilha que ainda pede
              atenção, e ela não pode crescer só porque alguém pediu para ver as tratadas.
              Viagens em destaque; o total de alertas fica ao lado, menor, para quem faz a conta. */}
          <span className="text-sm tabular-nums">
            {t("activeTrips", { count: activeTripCount })}
            {activeAlertCount > activeTripCount ? (
              <span className="text-muted-foreground">
                {" · "}
                {t("activeAlerts", { count: activeAlertCount })}
              </span>
            ) : null}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAcknowledged((current) => !current)}
          >
            {/* The count only appears while they are shown: with the list filtered to active, the
                app genuinely does not know how many silenced ones are behind the toggle. */}
            {showAcknowledged
              ? t("hideAcknowledged", { count: acknowledgedCount })
              : t("showAcknowledged")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : query.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t("loadError")}
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {showAcknowledged ? t("emptyIncludingAcknowledged") : t("empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {visiveis.map((g) => {
              const tudoReconhecido = g.activeItems.length === 0;
              // Quem silenciou — mostrado a partir do primeiro reconhecido, porque o gesto é um só.
              const quem = g.acknowledgedItems.find((a) => a.acknowledgedByName);
              return (
                <li
                  key={g.tripId}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm ${
                    tudoReconhecido ? "bg-muted/40 text-muted-foreground" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/trips/${g.tripId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {g.externalTripId ?? g.tripId.slice(0, 8)}
                    </Link>
                    {g.customerName ? (
                      <span className="text-muted-foreground">· {g.customerName}</span>
                    ) : null}
                    {/* Os motivos, um por etiqueta. Reconhecido fica apagado no meio dos outros:
                        a viagem continua sendo uma linha só. */}
                    {g.items.map((a) => (
                      <span
                        key={a.id}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          a.state === "acknowledged"
                            ? "bg-muted text-muted-foreground line-through"
                            : (SEVERITY_CLASS[a.severity] ?? "")
                        }`}
                      >
                        {t(`caseValue.${a.alertCase}` as Parameters<typeof t>[0])}
                      </span>
                    ))}
                    <span className="text-muted-foreground">{formatDateTime(g.firstAt)}</span>
                  </div>
                  {tudoReconhecido ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs">
                        {quem?.acknowledgedByName
                          ? t("acknowledgedByAt", {
                              name: quem.acknowledgedByName,
                              at: formatDateTime(quem.acknowledgedAt),
                            })
                          : t("acknowledged")}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={unacknowledge.isPending}
                        onClick={() => {
                          for (const a of g.acknowledgedItems) {
                            unacknowledge.mutate(a.id, {
                              onError: (e) => console.error(mapError(e)),
                            });
                          }
                        }}
                      >
                        {t("undoAcknowledge")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={acknowledge.isPending}
                      onClick={() => {
                        // Silencia a VIAGEM: todos os motivos ainda abertos, de uma vez. É o gesto
                        // que a pessoa faz — "essa eu vi" —, não um clique por sintoma.
                        for (const a of g.activeItems) {
                          acknowledge.mutate(a.id, {
                            onError: (e) => console.error(mapError(e)),
                          });
                        }
                      }}
                    >
                      {t("acknowledge")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {totalPaginas > 1 ? (
          <div className="flex items-center justify-between border-t pt-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {t("page", { current: paginaAtual, total: totalPaginas })}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={paginaAtual <= 1}
                onClick={() => setPagina(paginaAtual - 1)}
              >
                {t("previous")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={paginaAtual >= totalPaginas}
                onClick={() => setPagina(paginaAtual + 1)}
              >
                {t("next")}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
