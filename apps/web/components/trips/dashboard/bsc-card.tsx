"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@brazil-tms/shared";
import type { BscPeriod, BscSnapshotView } from "@brazil-tms/db";
import { Card, CardTitle } from "@/components/ui/card";
import { indicadoresNaTela } from "@/lib/bsc/indicadores";

/**
 * O BSC do cliente dentro do painel (2026-08-17).
 *
 * Este é o único cartão do painel cujo número NÃO é do TMS: é a nota que a Shopee dá à Brazil
 * Transports, copiada de um relatório do Looker Studio que fecha às 4h da manhã. Três decisões saem
 * disso, e todas são sobre não deixar o dado mentir:
 *
 *   A FAIXA DE ORIGEM. Uma linha laranja no topo e o rótulo "BSC · Shopee" — o único lugar do painel
 *   que sai da paleta do TMS, de propósito. Sem isso, daqui a seis meses alguém discute o SPOT
 *   achando que é conta nossa.
 *
 *   O CARIMBO DO RELATÓRIO, sempre visível. Não a hora em que o robô leu: a hora que o BSC diz. Se a
 *   Shopee falhar de publicar, o cartão mostra a data velha em vez de fingir — a mesma regra do "ao
 *   vivo / sem atualizar" do painel de parede.
 *
 *   A BARRA É A DISTÂNCIA ATÉ O PISO, não o valor. "46%" e "98%" lado a lado são dois números; 46
 *   contra um piso de 77 é um problema. A barra é o que faz o pior indicador gritar sem ninguém
 *   precisar saber os alvos de cor.
 */

/**
 * Os pisos que a Shopee publica na página "Premissas" do próprio relatório.
 *
 * Ficam aqui, e não no banco, porque são a REGRA DO CLIENTE e mudam junto com a versão do scorecard
 * (o relatório já se chama "V3"). Guardá-los numa tabela criaria a ilusão de que a operação os
 * controla. Um indicador sem piso conhecido aparece com o número e sem barra — nunca com um alvo
 * inventado.
 */
const PISO: Record<string, number> = {
  SPOT: 77,
  "ETA Origem": 97,
  "ETA Destino": 93,
  Telemetria: 97,
  "No Show": 97,
  Reversa: 97.5,
};

/**
 * OS VINTE, e não seis (2026-08-18).
 *
 * O robô sempre leu o painel KPI inteiro e o banco sempre guardou os vinte; a TELA é que mostrava um
 * recorte de seis. Quem olhava o TMS via seis números e o BSC do cliente, vinte — e a diferença não
 * estava escrita em lugar nenhum, que é a pior forma de um painel mentir: por omissão silenciosa.
 *
 * A ordem e a regra de quem entra moram em `@/lib/bsc/indicadores`, fora do componente e sob teste.
 */

function tom(valor: number, piso: number | undefined): string {
  if (piso == null) return "text-foreground";
  if (valor >= piso) return "text-success";
  // Metade do caminho até o piso separa "quase lá" de "longe" — sem isso, tudo abaixo vira vermelho
  // e o cartão perde a capacidade de dizer o que é urgente.
  return valor >= piso * 0.85 ? "text-warning" : "text-destructive";
}

function barra(valor: number, piso: number | undefined): { largura: string; cor: string } {
  if (piso == null) return { largura: "0%", cor: "transparent" };
  const pct = Math.max(0, Math.min(100, (valor / piso) * 100));
  const cor =
    valor >= piso
      ? "hsl(var(--success))"
      : valor >= piso * 0.85
        ? "hsl(var(--warning))"
        : "hsl(var(--destructive))";
  return { largura: `${pct}%`, cor };
}

export function BscCard({ snapshots }: { snapshots: BscSnapshotView[] }) {
  const t = useTranslations("Bsc");
  // Começa no mês: é o recorte em que o contrato é avaliado.
  const [periodo, setPeriodo] = useState<BscPeriod>("month");

  // Um recorte que nunca chegou não vira aba — um botão que abre o vazio é pior que a ausência dele.
  const disponiveis = snapshots.map((s) => s.period);
  const atual = snapshots.find((s) => s.period === periodo) ?? snapshots[0];
  if (!atual) return null;

  const nota = atual.score;
  // O velocímetro do BSC vai a 110, não a 100: o Scheduling passa de 100 legitimamente.
  const fracao = nota == null ? 0 : Math.max(0, Math.min(1, nota / 110));
  const raio = 42;
  const comprimento = Math.PI * raio;

  return (
    <Card className="relative col-span-full overflow-hidden p-3">
      {/* A faixa de origem: 3px dizendo "isto vem de fora". */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-[hsl(14_89%_55%)]" />

      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <CardTitle className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[hsl(14_89%_45%)] dark:text-[hsl(14_89%_62%)]">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
          {t("source")}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1">
          {(["day", "week", "month"] as BscPeriod[])
            .filter((p) => disponiveis.includes(p))
            .map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodo(p)}
                aria-pressed={p === atual.period}
                className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold transition-colors ${
                  p === atual.period
                    ? "bg-[hsl(14_89%_55%/0.12)] text-[hsl(14_89%_45%)] dark:text-[hsl(14_89%_62%)]"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t(`period.${p}`)}
              </button>
            ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <svg
            width="104"
            height="60"
            viewBox="0 0 104 60"
            role="img"
            aria-label={t("gaugeAlt", { score: nota ?? 0 })}
          >
            <path
              d="M10 55 A42 42 0 0 1 94 55"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="10"
              strokeLinecap="round"
            />
            <path
              d="M10 55 A42 42 0 0 1 94 55"
              fill="none"
              stroke="hsl(var(--warning))"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${comprimento * fracao} ${comprimento}`}
            />
          </svg>
          <div className="min-w-0">
            <div className="text-2xl font-bold leading-none tabular-nums">
              {nota == null ? "—" : nota.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            {atual.zone ? (
              <div className="text-xs font-semibold text-warning">{atual.zone}</div>
            ) : null}
            <div className="text-[0.68rem] text-muted-foreground">
              {t("stamp", { at: formatDateTime(atual.capturedAt) })}
            </div>
          </div>
        </div>

        {/* Vinte cartões pedem mais colunas que seis: numa TV larga eles fecham em duas fileiras. */}
        <ul className="grid min-w-[280px] flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7 2xl:grid-cols-10">
          {indicadoresNaTela(atual.indicators).map((nome) => {
            const valor = atual.indicators[nome]!;
            const piso = PISO[nome];
            const { largura, cor } = barra(valor, piso);
            return (
              <li key={nome} className="flex min-w-0 flex-col gap-1 rounded border p-1.5">
                {/* Duas linhas em vez de reticências: "Atendimento Check List" cortado vira
                    "Atendimento Chec…", e numa TV ninguém passa o mouse para descobrir o resto. */}
                <span
                  title={nome}
                  className="line-clamp-2 min-h-[1.7em] text-[0.64rem] uppercase leading-tight tracking-wide text-muted-foreground"
                >
                  {nome}
                </span>
                <span className="flex items-baseline justify-between gap-1">
                  <span className={`text-base font-bold leading-none ${tom(valor, piso)}`}>
                    {valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                  </span>
                  {piso != null ? (
                    <span className="text-[0.62rem] text-muted-foreground">{piso}</span>
                  ) : null}
                </span>
                <span className="h-[3px] overflow-hidden rounded-sm bg-muted">
                  <span
                    className="block h-full rounded-sm"
                    style={{ width: largura, backgroundColor: cor }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {atual.periodLabel ? (
        <div className="mt-2 border-t pt-1.5 text-[0.68rem] text-muted-foreground">
          {atual.periodLabel}
        </div>
      ) : null}
    </Card>
  );
}
