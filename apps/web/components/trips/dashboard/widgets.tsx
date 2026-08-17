"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  saoPauloDate,
  saoPauloMonthBounds,
  TRIP_STATUSES,
  type TripStatus,
} from "@brazil-tms/shared";
import type { DashboardSummary } from "@brazil-tms/db";
import { useDashboardSummary } from "@/lib/trips/client";
import { TripStatusBadge } from "@/components/trips/trip-status-badge";
import { BOARD_ANCHOR } from "@/components/trips/control-tower-table";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Home daily dashboard widgets (US4, §15.2). Read-first: data comes from `useDashboardSummary`
 * (60s polling via TanStack Query — NO Realtime). Renders the eight §15.2 widgets as a responsive
 * grid of Cards. The COMPUTED widgets (trips-today-by-status, billing-pending, and — since 006 — the
 * unassigned-trips count) deep-link into the filtered Control Tower board; the remaining later-slice
 * metrics (SLA risk → 007, exceptions/on-time → 007, missing docs → 008) arrive as `null` from the
 * read model and render a labelled placeholder — numbers are NEVER invented here.
 */

type MetricCardProps = {
  /** i18n key under `Trips.dashboard` for the card title. */
  titleKey: string;
  /** The metric value to display (already formatted, e.g. "12" or "87%"); ignored when placeholder. */
  value?: ReactNode;
  /** Board deep-link for a computed (non-null) metric; omitted → no "view in board" affordance. */
  href?: string;
  /** When true, render the "available in a later step" placeholder instead of a value/link. */
  placeholder?: boolean;
};

/**
 * O painel inteiro é COMPACTO (2026-08-17).
 *
 * Cada cartão ocupava a altura de um parágrafo para mostrar um número de duas casas, e com doze
 * deles o painel virava rolagem. Um painel que não cabe na tela deixa de ser painel: a pessoa lê os
 * quatro primeiros e para. Cabeçalho e corpo dividem um bloco só, o número encolhe de 3xl para 2xl e
 * a moldura aperta — sem tirar nenhuma informação.
 */
function MetricCard({ titleKey, value, href, placeholder }: MetricCardProps) {
  const t = useTranslations("Trips.dashboard");

  return (
    <Card className="p-3">
      <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t(titleKey)}
      </CardTitle>
      {placeholder ? (
        <p className="mt-1 text-xs text-muted-foreground">{t("placeholder")}</p>
      ) : (
        <>
          <div className="mt-1 text-2xl font-semibold leading-none tabular-nums">{value}</div>
          {href ? (
            <Link
              href={href}
              className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
            >
              {t("viewInBoard")}
            </Link>
          ) : null}
        </>
      )}
    </Card>
  );
}

/**
 * Etapas que NÃO entram no quadro do painel (2026-08-17, a pedido).
 *
 * Carregando, Carregada, Descarregando e Descarregada são passagens de minutos dentro de uma parada
 * — aparecem e somem, e cada uma custava uma linha permanente num cartão que precisa caber na tela.
 * Faturamento pendente sai por outro motivo: é assunto da tela de Faturamento, não da operação.
 *
 * Elas continuam existindo, contando e valendo em todo o resto do sistema — inclusive no total do
 * cartão do mês, que segue sendo o número real. O que muda é só quais linhas ocupam espaço aqui.
 */
const STATUS_OCULTOS = new Set<TripStatus>([
  "loading",
  "loaded",
  "unloading",
  "unloaded",
  "billing_pending",
]);

/**
 * A lista de status de um cartão, cada linha levando ao quadro já filtrado.
 *
 * Serve os DOIS cartões — o de hoje e o do mês — porque a única diferença entre eles é o recorte de
 * data no link. Duas cópias divergiriam no primeiro ajuste de estilo, e a pessoa veria dois quadros
 * que se comportam diferente sem motivo.
 */
function StatusList({
  byStatus,
  emptyKey,
  dateFilter,
}: {
  byStatus: DashboardSummary["tripsTodayByStatus"];
  emptyKey: string;
  /** O trecho de data do link — o MESMO recorte que o cartão contou. */
  dateFilter: string;
}) {
  const t = useTranslations("Trips.dashboard");
  // A ordem é a do ciclo de vida, não a do banco: quem lê espera Recebida antes de Em trânsito, e
  // um quadro que reordena a cada atualização obriga a procurar de novo o que já se sabia onde era.
  const ordenadas = byStatus
    .filter((s) => !STATUS_OCULTOS.has(s.status))
    .sort((a, b) => TRIP_STATUSES.indexOf(a.status) - TRIP_STATUSES.indexOf(b.status));

  if (ordenadas.length === 0) {
    return <p className="text-xs text-muted-foreground">{t(emptyKey)}</p>;
  }
  return (
    <ul className="space-y-1">
      {ordenadas.map(({ status, count }) => (
        <li key={status}>
          <Link
            href={`/trips?status=${status}${dateFilter}&scope=all#${BOARD_ANCHOR}`}
            className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-muted"
          >
            <TripStatusBadge status={status} />
            <span className="text-sm font-semibold tabular-nums">{count}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Computed widget #1: trips today, broken down by status, each row deep-linking into the board. */
function TripsTodayCard({ byStatus }: { byStatus: DashboardSummary["tripsTodayByStatus"] }) {
  const t = useTranslations("Trips.dashboard");
  // The count is over today's São Paulo pickup window, so the deep-link must carry the SAME BRT day
  // (pickupFrom=pickupTo=today) — otherwise it would show all trips of that status, not today's.
  const today = saoPauloDate();

  const total = byStatus.reduce((n, s) => n + s.count, 0);

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("tripsToday")}
        </CardTitle>
        <span className="text-sm font-semibold tabular-nums">{total}</span>
      </div>
      <StatusList
        byStatus={byStatus}
        emptyKey="empty"
        dateFilter={`&pickupFrom=${today}&pickupTo=${today}`}
      />
    </Card>
  );
}

/**
 * O mesmo quadro, no MÊS corrente (2026-08-17).
 *
 * Substituiu o cartão de "Faturamento pendente" a pedido, e nasceu sem recorte de data — virou
 * mensal no mesmo dia, também a pedido, e o pedido está certo: com o histórico do portal dentro,
 * "todas" passou a somar 30 dias de operação encerrada. Um número que cresce para sempre e não muda
 * decisão de ninguém. O mês é o ciclo em que a operação e o faturamento realmente pensam.
 *
 * O link carrega o MESMO recorte que o cartão contou — um cartão que abre um quadro com outro número
 * é pior do que não abrir nada.
 */
function TripsMonthCard({ byStatus }: { byStatus: DashboardSummary["tripsByStatus"] }) {
  const t = useTranslations("Trips.dashboard");
  const total = byStatus.reduce((n, s) => n + s.count, 0);
  const { first, last } = saoPauloMonthBounds();

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("tripsMonth")}
        </CardTitle>
        <span className="text-sm font-semibold tabular-nums">{total}</span>
      </div>
      <StatusList
        byStatus={byStatus}
        emptyKey="emptyMonth"
        dateFilter={`&pickupFrom=${first}&pickupTo=${last}`}
      />
    </Card>
  );
}

export function DashboardWidgets() {
  const t = useTranslations("Trips.dashboard");
  const tCommon = useTranslations("Common");
  const { data, isLoading, isError } = useDashboardSummary();

  if (isLoading) {
    return (
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
        aria-busy="true"
        aria-label={tCommon("loading")}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="p-3">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="mt-2 h-6 w-1/3" />
          </Card>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-6">
          <p role="alert" className="text-sm text-destructive">
            {t("loadError")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { summary } = data;

  /**
   * A later-slice metric: a number → value + deep-link into the board; `null` → labelled placeholder
   * (never invented). The dimension-specific board filters (SLA risk → 007, exceptions/on-time → 007,
   * missing docs → 008) are NOT yet in the board query schema, so those deep-link to the broad
   * `scope=all` board. The 006 `assigned` filter DOES exist, so `unassignedTrips` passes its precise
   * deep-link (the "Unassigned" view) via `href`.
   */
  function metric(
    titleKey: string,
    value: number | null,
    format: (n: number) => ReactNode = (n) => n,
    href = "/trips?scope=all",
  ): MetricCardProps {
    if (value === null) return { titleKey, placeholder: true };
    // A âncora vai em TODO atalho do painel, não só nos status: quem clica num número daqui quer ver
    // as viagens dele, e não o topo de uma página com a lista de avisos na frente.
    const alvo = href.startsWith("/trips") ? `${href}#${BOARD_ANCHOR}` : href;
    return { titleKey, value: format(value), href: alvo };
  }

  const pct = (n: number) => `${n}%`;

  // 006 — the "Unassigned" view deep-link (matches the DEFAULT_TRIP_VIEWS "unassigned" preset).
  const unassignedHref = "/trips?assigned=false&scope=active&sort=pickupStart";
  // 007 — the "At risk" view deep-link (matches the DEFAULT_TRIP_VIEWS "atRisk" preset).
  const atRiskHref = "/trips?atRisk=true&scope=active&sort=pickupStart";
  // 007 — exception queue deep-link (the Exception Management screen).
  const exceptionsHref = "/exceptions";
  // 008 — the "Missing documents" view deep-link (matches the DEFAULT_TRIP_VIEWS "missingDocuments").
  const missingDocsHref = "/trips?missingDocuments=true&scope=active&sort=pickupStart";

  /**
   * As duas filas do Planejado (2026-08-17).
   *
   * São decisões de GENTE, não estados de caminhão — e é por isso que vêm primeiro: aceitar uma
   * proposta e despachar um motorista são as duas coisas que só acontecem se alguém fizer.
   *
   * Ainda sem link para o quadro: o filtro por aceitação não existe lá, e um atalho que abre uma
   * lista com outro número é pior do que número nenhum. É o próximo passo.
   */
  const filas: MetricCardProps[] = [
    { titleKey: "awaitingAcceptance", value: summary.awaitingAcceptance },
    { titleKey: "awaitingAssignment", value: summary.awaitingAssignment },
  ];

  const metrics: MetricCardProps[] = [
    metric("tripsAtRisk", summary.tripsAtRisk, (n) => n, atRiskHref),
    metric("unassignedTrips", summary.unassignedTrips, (n) => n, unassignedHref),
    metric("activeExceptions", summary.activeExceptions, (n) => n, exceptionsHref),
    metric("onTimePickup", summary.onTimePickupPct, pct),
    metric("onTimeArrival", summary.onTimeArrivalPct, pct),
    metric(
      "completedMissingDocuments",
      summary.completedMissingDocuments,
      (n) => n,
      missingDocsHref,
    ),
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {filas.map((m) => (
        <MetricCard key={m.titleKey} {...m} />
      ))}
      <TripsTodayCard byStatus={summary.tripsTodayByStatus} />
      {/* Trocou o cartão de "Faturamento pendente" (2026-08-17, a pedido): o número do faturamento
          vive na tela de Faturamento, e aqui a pergunta é sobre a operação. */}
      <TripsMonthCard byStatus={summary.tripsByStatus} />
      {metrics.map((m) => (
        <MetricCard key={m.titleKey} {...m} />
      ))}
    </div>
  );
}
