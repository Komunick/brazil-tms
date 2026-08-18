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
import { BscCard } from "@/components/trips/dashboard/bsc-card";
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
 * quatro primeiros e para.
 *
 * O aperto veio em duas rodadas, ambas a pedido. Na segunda, o que sobrava era espaço VAZIO dentro do
 * cartão: o "ver no quadro" ocupava uma terceira linha só para repetir, em todos eles, a mesma frase.
 * Agora o cartão INTEIRO é o link quando há para onde ir — a área clicável cresce, a frase some, e a
 * altura cai de três linhas para duas. O cartão sem destino continua sendo um bloco morto, e é bom
 * que seja: a diferença entre "dá para abrir" e "é só um número" passou a ser visível.
 */
function MetricCard({ titleKey, value, href, placeholder }: MetricCardProps) {
  const t = useTranslations("Trips.dashboard");

  const conteudo = (
    <>
      <CardTitle className="text-[0.68rem] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
        {t(titleKey)}
      </CardTitle>
      {placeholder ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{t("placeholder")}</p>
      ) : (
        <div className="mt-0.5 text-xl font-semibold leading-none tabular-nums">{value}</div>
      )}
    </>
  );

  if (href && !placeholder) {
    return (
      <Card className="p-0 transition-colors hover:bg-muted/60">
        <Link href={href} className="block p-2.5" title={t("viewInBoard")}>
          {conteudo}
        </Link>
      </Card>
    );
  }
  return <Card className="p-2.5">{conteudo}</Card>;
}

/**
 * Etapas que NÃO entram no quadro do painel (2026-08-17, a pedido).
 *
 * Carregando, Carregada, Descarregando e Descarregada são passagens de minutos dentro de uma parada
 * — aparecem e somem, e cada uma custava uma linha permanente num cartão que precisa caber na tela.
 * Na origem e No destino saíram na mesma lógica, na segunda rodada: são o "chegou e está parado ali",
 * que a torre acompanha viagem a viagem e não por contagem. Faturamento pendente sai por outro
 * motivo: é assunto da tela de Faturamento, não da operação.
 *
 * Elas continuam existindo, contando e valendo em todo o resto do sistema — inclusive no total do
 * cartão, que segue sendo o número real. O que muda é só quais linhas ocupam espaço aqui.
 */
const STATUS_OCULTOS = new Set<TripStatus>([
  "at_origin",
  "loading",
  "loaded",
  "at_destination",
  "unloading",
  "unloaded",
  "billing_pending",
]);

/**
 * A lista de status de um cartão, cada linha levando ao quadro já filtrado.
 *
 * Serve os TRÊS cartões — hoje, amanhã e mês — porque a única diferença entre eles é o recorte de
 * data no link. Três cópias divergiriam no primeiro ajuste de estilo, e a pessoa veria três quadros
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

/**
 * Um quadro de viagens por status, num recorte de data.
 *
 * Nasceu como dois componentes quase idênticos (hoje e mês); com a chegada de AMANHÃ virou um só —
 * a regra dos três do `PRINCIPLES.md`. A única diferença entre eles sempre foi o título, o recorte e
 * a frase de vazio; o resto era cópia esperando divergir no primeiro ajuste de estilo.
 *
 * O link de cada linha carrega o MESMO recorte que o cartão contou. Um cartão que abre um quadro com
 * outro número é pior do que um cartão que não abre nada.
 */
function StatusCard({
  titleKey,
  emptyKey,
  byStatus,
  dateFilter,
}: {
  titleKey: string;
  emptyKey: string;
  byStatus: DashboardSummary["tripsTodayByStatus"];
  dateFilter: string;
}) {
  const t = useTranslations("Trips.dashboard");
  const total = byStatus.reduce((n, s) => n + s.count, 0);

  return (
    <Card className="p-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <CardTitle className="text-[0.68rem] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
          {t(titleKey)}
        </CardTitle>
        <span className="text-sm font-semibold tabular-nums">{total}</span>
      </div>
      <StatusList byStatus={byStatus} emptyKey={emptyKey} dateFilter={dateFilter} />
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
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
        aria-busy="true"
        aria-label={tCommon("loading")}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-2.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="mt-1.5 h-5 w-1/3" />
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

  const { summary, bsc } = data;

  /**
   * Um número do painel: valor + atalho para o quadro; `null` → o aviso de "ainda não medido", nunca
   * um número inventado. O atalho é sempre o filtro EXATO que produziu a contagem.
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


  // 007 — the "At risk" view deep-link (matches the DEFAULT_TRIP_VIEWS "atRisk" preset).
  const atRiskHref = "/trips?atRisk=true&scope=active&sort=pickupStart";

  /**
   * A fila do despacho, agora COM atalho para o quadro (2026-08-17, a pedido).
   *
   * Antes ela era um número sem destino, e por um motivo bom: o quadro não tinha filtro para o eixo
   * de aceitação, e o `assigned=false` que existia responde outra pergunta — se o TMS tem atribuição,
   * não se o PORTAL tem motorista. Os totais divergem, e mandar o clique para a lista errada teria
   * sido pior do que não mandar.
   *
   * O filtro certo passou a existir (`awaitingAssignment=true`), montado sobre o MESMO predicado que
   * conta este cartão. É isso que garante que o número aqui e o total de lá sejam o mesmo número.
   */
  const awaitingAssignmentHref = "/trips?awaitingAssignment=true&scope=active&sort=pickupStart";

  const cartoes: MetricCardProps[] = [
    metric("awaitingAssignment", summary.awaitingAssignment, (n) => n, awaitingAssignmentHref),
    metric("tripsAtRisk", summary.tripsAtRisk, (n) => n, atRiskHref),
  ];

  const hoje = saoPauloDate();
  const amanha = saoPauloDate(1);
  const mes = saoPauloMonthBounds();

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {/* O BSC abre o painel: é a nota que decide contrato, e vem do cliente, não daqui. */}
      {bsc.length > 0 ? <BscCard snapshots={bsc} /> : null}
      {cartoes.map((m) => (
        <MetricCard key={m.titleKey} {...m} />
      ))}
      <StatusCard
        titleKey="tripsToday"
        emptyKey="empty"
        byStatus={summary.tripsTodayByStatus}
        dateFilter={`&pickupFrom=${hoje}&pickupTo=${hoje}`}
      />
      {/* Amanhã (2026-08-17, a pedido): numa TV no meio da sala, de tarde, a pergunta que ainda tem
          resposta é a do dia seguinte. */}
      <StatusCard
        titleKey="tripsTomorrow"
        emptyKey="emptyTomorrow"
        byStatus={summary.tripsTomorrowByStatus}
        dateFilter={`&pickupFrom=${amanha}&pickupTo=${amanha}`}
      />
      {/* Trocou o cartão de "Faturamento pendente" (2026-08-17, a pedido): o número do faturamento
          vive na tela de Faturamento, e aqui a pergunta é sobre a operação. */}
      <StatusCard
        titleKey="tripsMonth"
        emptyKey="emptyMonth"
        byStatus={summary.tripsByStatus}
        dateFilter={`&pickupFrom=${mes.first}&pickupTo=${mes.last}`}
      />
    </div>
  );
}
