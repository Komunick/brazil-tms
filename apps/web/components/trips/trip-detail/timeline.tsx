"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, TRIP_STATUSES, type TripStatus } from "@brazil-tms/shared";
import type { TripDetailView } from "@/lib/trips/trips-read";
import { montarLinhaDoTempo } from "@/lib/trips/timeline";

/**
 * A LINHA DO TEMPO PASSA A SER DE LEITURA (2026-08-24, a pedido).
 *
 * Ela nasceu com um gravador de marcos — botões que avançavam a viagem pela máquina de status. Isso
 * fazia sentido quando o TMS era a fonte da execução, e deixou de fazer quando o robô do portal
 * passou a trazer cada marco de minuto em minuto.
 *
 * O QUE ACONTECIA. Marcar à mão criava divergência entre os dois sistemas. Em 24/08 alguém marcou a
 * LT0Q8M02E4IU1 como no destino às 16:47 enquanto o portal dizia Departed; todos os outros marcos
 * daquela viagem vieram do robô, e o único errado foi o manual. O erro não se anuncia — a viagem
 * simplesmente passa a mentir, nas duas telas, até alguém reparar.
 *
 * O QUE FICA. A lista cronológica com os desvios de planejado contra realizado, e a NOTA livre:
 * escrever observação é do TMS e não do portal, e é o que permite explicar o que a máquina não sabe.
 *
 * A rota e a máquina de status continuam intactas — o que saiu foi a OFERTA na tela.
 */

const MINUTE = 60_000;

export function TimelineSection({ trip }: { trip: TripDetailView }) {
  const t = useTranslations("Trips.detail");
  const tStatus = useTranslations("Trips.status");
  const tEvent = useTranslations("Trips.detail.eventType");




  // A ordenação e a junção das linhas moram em `lib/trips/timeline` — pura, e com teste. Ver lá o
  // porquê: cada marco vinha duplicado com a mudança de status que ele provocou, e o empate entre os
  // dois saía do banco, trocando blocos inteiros de lugar entre uma atualização e outra.
  const ordered = montarLinhaDoTempo(trip.events);

  const statusLabel = (s: string | null) => {
    if (!s) return "—";
    return (TRIP_STATUSES as readonly string[]).includes(s) ? tStatus(s as TripStatus) : s;
  };

  const eventLabel = (type: string) => {
    try {
      return tEvent(type as never);
    } catch {
      return type;
    }
  };


  /** Planned-vs-actual delta for an arrival milestone (FR-005). Returns a localized label or null. */
  const deltaLabel = (statusAfter: string | null, eventTs: string | null): string | null => {
    if (!eventTs) return null;
    let planned: string | null = null;
    if (statusAfter === "at_origin") planned = trip.plannedPickupWindowEnd;
    else if (statusAfter === "at_destination") planned = trip.plannedDeliveryWindowEnd;
    if (!planned) return null;
    const diffMin = Math.round(
      (new Date(eventTs).getTime() - new Date(planned).getTime()) / MINUTE,
    );
    if (diffMin === 0) return t("deltaOnTime");
    return diffMin > 0
      ? t("deltaLate", { minutes: diffMin })
      : t("deltaEarly", { minutes: -diffMin });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sectionTimeline")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/*
          OS BOTÕES DE MARCO SAÍRAM (2026-08-24, a pedido).
          Quem sabe onde o caminhão está é o PORTAL, e o robô traz isso de minuto em minuto. Marcar
          o marco à mão aqui só criava divergência: em 24/08 uma pessoa marcou a LT0Q8M02E4IU1 como
          "no destino" às 16:47 enquanto o portal dizia "Departed", e a viagem passou a mentir nas
          duas telas. Todos os outros marcos dela vieram do robô — o manual foi o único errado.

          A rota e a máquina de status continuam existindo, intactas: o que saiu é a OFERTA na tela.
          Registrar milestone segue possível para quem tiver motivo, por outro caminho.
        */}

        {/*
          O CAMPO DE ESCREVER SAIU (2026-08-28, a pedido).

          A linha do tempo passa a ser só LEITURA: o que aconteceu, na ordem em que aconteceu.

          É a mesma decisão que já tinha tirado daqui os botões de marco, em 24/08, e pelo mesmo
          motivo: esta seção conta o que o PORTAL relatou, e tudo o que se escreve à mão aqui
          dentro passa a disputar veracidade com o que o robô trouxe. O recado de gente tem lugar
          próprio — os comentários da viagem, e o marcador de recado na linha da programação, que
          existe justamente para escrever sem abrir a LH.

          A rota de nota segue existindo e nada foi apagado: as notas já gravadas continuam
          aparecendo na coluna de observação da tabela abaixo. O que saiu é a OFERTA de escrever.
        */}

        {/* Chronological event list with planned-vs-actual deltas. */}
        {ordered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("timelineEmpty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("auditWhen")}</TableHead>
                <TableHead>{t("colEvent")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("colDelta")}</TableHead>
                <TableHead>{t("sectionNotes")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((ev) => {
                const delta = deltaLabel(ev.statusAfter, ev.eventTimestamp);
                return (
                  <TableRow key={ev.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(ev.instante)}
                    </TableCell>
                    <TableCell>{eventLabel(ev.eventType)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {ev.statusBefore || ev.statusAfter
                        ? `${statusLabel(ev.statusBefore)} → ${statusLabel(ev.statusAfter)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {delta ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{ev.notes ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
