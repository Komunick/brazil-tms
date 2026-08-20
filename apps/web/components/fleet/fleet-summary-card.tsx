"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Truck, ChevronRight } from "lucide-react";
import { fromUtc } from "@brazil-tms/shared";
import { useFleet } from "@/lib/fleet/client";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A FROTA EM QUATRO NÚMEROS, no topo da Torre de Controle (2026-08-20, a pedido).
 *
 * Ocupa o lugar dos "Alertas ativos". A troca é do usuário e tem uma lógica: o quadro de alertas
 * listava avisos que a própria tabela abaixo já mostra por viagem, enquanto onde está o caminhão era
 * informação que o TMS simplesmente não tinha.
 *
 * ── OS QUATRO, E POR QUE ESTES ─────────────────────────────────────────────────────────────────
 *
 * ANDANDO e PARADOS respondem "a operação está se mexendo?" — vêm do próprio rastreador, que escreve
 * `MOVIMENTANDO` ou `PARADO` sem precisar de intérprete.
 *
 * SEM COMUNICAR é o único que fala do EQUIPAMENTO e não do caminhão: rastreador mudo há mais de uma
 * hora não quer dizer veículo parado, quer dizer que a informação envelheceu. Confundir os dois
 * inverte o diagnóstico, e a régua é a hora da POSIÇÃO, não a da leitura.
 *
 * FORA DE ROTA é o único que o TMS não teria como calcular: quem sabe a rota planejada do caminhão é
 * o rastreador.
 *
 * O cartão inteiro é o link para a página, como no painel do dia — a área clicável cresce e a frase
 * "ver detalhes" some.
 */
export function FleetSummaryCard() {
  const t = useTranslations("Fleet");
  const { data, isLoading, isError } = useFleet();

  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-8 w-full" />
      </Card>
    );
  }

  /**
   * Sem dado NÃO é um erro vermelho: é o estado de quem ainda não ligou o robô do rastreador.
   *
   * A frase diz o que fazer em vez de acusar falha — e some sozinha no primeiro retrato que chegar.
   */
  if (isError || !data || data.summary.total === 0) {
    return (
      <Card className="p-4">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Truck className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t("title")}
        </CardTitle>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("empty")}</p>
      </Card>
    );
  }

  const { summary } = data;
  const numeros = [
    { rotulo: t("moving"), valor: summary.moving, cor: "text-success" },
    { rotulo: t("stopped"), valor: summary.stopped, cor: "" },
    {
      rotulo: t("silent"),
      valor: summary.silentOverAnHour,
      cor: summary.silentOverAnHour > 0 ? "text-warning" : "",
    },
    {
      rotulo: t("offRoute"),
      valor: summary.offRoute,
      cor: summary.offRoute > 0 ? "text-destructive" : "",
    },
  ];

  return (
    <Card className="p-0 transition-colors hover:bg-muted/60">
      <Link href="/fleet" className="block p-4" title={t("openPage")}>
        <div className="flex items-baseline justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Truck className="h-4 w-4 text-muted-foreground" aria-hidden />
            {t("title")}
            <span className="font-normal text-muted-foreground">
              {t("total", { count: summary.total })}
            </span>
          </CardTitle>
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            {/* De quando é o retrato. Sem isto, quatro números parados a noite toda parecem quatro
                números atualizados a noite toda. */}
            {summary.lastReceivedAt
              ? t("lastRead", { time: fromUtc(summary.lastReceivedAt).toFormat("HH:mm") })
              : null}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {numeros.map((n) => (
            <div key={n.rotulo} className="border-l pl-3">
              <span
                className={`block text-2xl font-semibold leading-none tabular-nums ${n.cor}`.trim()}
              >
                {n.valor}
              </span>
              <span className="mt-1 block text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                {n.rotulo}
              </span>
            </div>
          ))}
        </div>
      </Link>
    </Card>
  );
}
