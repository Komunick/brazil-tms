"use client";

import { useState } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@brazil-tms/shared";
import type { BscPeriod, BscSnapshotView } from "@brazil-tms/db";
import { Card, CardTitle } from "@/components/ui/card";
import { frescorDoBsc, idadeEmTexto } from "@/lib/bsc/frescor";
import {
  faixaDo,
  indicadoresNaTela,
  META_EXIBIDA,
  PREMISSAS,
  resumoNaTela,
  type Faixa,
  type Premissa,
} from "@/lib/bsc/indicadores";

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
 * OS VINTE, e não seis (2026-08-18).
 *
 * O robô sempre leu o painel KPI inteiro e o banco sempre guardou os vinte; a TELA é que mostrava um
 * recorte de seis. Quem olhava o TMS via seis números e o BSC do cliente, vinte — e a diferença não
 * estava escrita em lugar nenhum, que é a pior forma de um painel mentir: por omissão silenciosa.
 *
 * As premissas (mínimo, meta, peso), a ordem e as três faixas moram em `@/lib/bsc/indicadores`,
 * fora do componente e sob teste.
 */

/**
 * As mesmas três cores do BSC, e por isso derivadas da MESMA faixa (2026-08-18).
 *
 * A versão anterior tinha uma regra própria — "85% do caminho até o piso vira amarelo" — inventada
 * porque só se conhecia o mínimo de seis indicadores. Com a meta publicada dos vinte em mãos, a
 * invenção sai: verde é ter batido a meta, amarelo é estar entre o mínimo e ela, vermelho é estar
 * abaixo do mínimo. É o que o cliente vê, e conferir os dois lados deixa de exigir tradução.
 */
/** A meia-lua do velocímetro: raio 74, de (16,95) a (164,95). Ver `raio` — os dois andam juntos. */
const ARCO = "M16 95 A74 74 0 0 1 164 95";

const TEXTO: Record<Faixa, string> = {
  acima: "text-success",
  atencao: "text-warning",
  abaixo: "text-destructive",
  sem_premissa: "text-foreground",
};

const FUNDO: Record<Faixa, string> = {
  acima: "hsl(var(--success))",
  atencao: "hsl(var(--warning))",
  abaixo: "hsl(var(--destructive))",
  sem_premissa: "transparent",
};

/** A barra mede a distância até a META, que é o alvo — não até o mínimo, que é só o piso do vexame. */
function larguraAteAMeta(valor: number, premissa: Premissa | undefined): string {
  // Meta zero (Acidente Fatal) já está cumprida por definição — dividir por ela daria infinito.
  if (!premissa || premissa.target <= 0) return "100%";
  return `${Math.max(0, Math.min(100, (valor / premissa.target) * 100))}%`;
}

/**
 * O CARTÃO ENCOLHIDO (2026-08-23, a pedido).
 *
 * Com os vinte indicadores este cartão ocupa a linha inteira e empurra o resto do painel para
 * baixo — e ele é o único cartão daqui cujo número não é da operação. Quem passa o dia olhando
 * o painel quer a nota e os seis de sempre; os vinte servem para conferir com o cliente, e isso
 * não é diário.
 *
 * Encolhido mostra a NOTA e os seis de `PRINCIPAIS_BSC` — os mesmos da primeira versão deste
 * cartão. O carimbo e o aviso de BSC parado ficam nos DOIS estados: são o que impede o número
 * velho de passar por atual, e escondê-los ao encolher seria esconder justamente a parte que
 * não pode faltar.
 */
export function BscCard({
  snapshots,
  minimizado = false,
  onAlternarMinimizado,
}: {
  snapshots: BscSnapshotView[];
  minimizado?: boolean;
  onAlternarMinimizado?: () => void;
}) {
  const t = useTranslations("Bsc");
  // Começa no mês: é o recorte em que o contrato é avaliado.
  const [periodo, setPeriodo] = useState<BscPeriod>("month");

  // Um recorte que nunca chegou não vira aba — um botão que abre o vazio é pior que a ausência dele.
  const disponiveis = snapshots.map((s) => s.period);
  const atual = snapshots.find((s) => s.period === periodo) ?? snapshots[0];
  if (!atual) return null;

  // `new Date()` no render é de propósito: este cartão já vive dentro de uma tela que se recarrega
  // sozinha, então a idade se atualiza junto com o resto — e um relógio congelado no primeiro render
  // seria a mesma classe de mentira que o aviso existe para acusar.
  const frescor = frescorDoBsc(atual.capturedAt, new Date());
  const nota = atual.score;
  // O velocímetro do BSC vai a 110, não a 100: o Scheduling passa de 100 legitimamente.
  const fracao = nota == null ? 0 : Math.max(0, Math.min(1, nota / 110));
  // Meia-lua de raio 74 num quadro de 180×104: começa em (16,95) e termina em (164,95). O raio e o
  // desenho saem da MESMA constante porque já erraram juntos — arco redesenhado à mão e comprimento
  // esquecido faz a barra parar antes do fim sem nada quebrar na tela.
  const raio = 74;
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
          {/* O botão fica JUNTO das abas de recorte: os dois mudam o que este cartão mostra,
              e separá-los faria procurar em dois cantos por controles do mesmo cartão. */}
          {onAlternarMinimizado ? (
            <button
              type="button"
              onClick={onAlternarMinimizado}
              aria-expanded={!minimizado}
              title={t(minimizado ? "expandir" : "minimizar")}
              className="ml-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {minimizado ? (
                <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden />
              )}
              <span className="sr-only">{t(minimizado ? "expandir" : "minimizar")}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {/* A NOTA CRESCEU JUNTO COM O BLOCO (2026-08-18).
            Com seis indicadores, um velocímetro de 104px equilibrava a fileira. Com vinte, o bloco
            ficou cinco vezes mais alto e a nota — que é o número que decide contrato — virou o menor
            elemento do cartão, boiando num vazio à esquerda. Tamanho aqui é hierarquia. */}
        <div className="flex flex-col items-center gap-1 px-2">
          <svg
            width="180"
            height="104"
            viewBox="0 0 180 104"
            role="img"
            aria-label={t("gaugeAlt", { score: nota ?? 0 })}
          >
            <path
              d={ARCO}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="16"
              strokeLinecap="round"
            />
            <path
              d={ARCO}
              fill="none"
              stroke="hsl(var(--warning))"
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={`${comprimento * fracao} ${comprimento}`}
            />
          </svg>
          <div className="-mt-6 flex flex-col items-center">
            <div className="text-4xl font-bold leading-none tabular-nums">
              {nota == null ? "—" : nota.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            {atual.zone ? (
              <div className="mt-1 text-sm font-semibold text-warning">{atual.zone}</div>
            ) : null}
            <div className="mt-0.5 text-[0.7rem] text-muted-foreground">
              {t("stamp", { at: formatDateTime(atual.capturedAt) })}
            </div>
            {/* O AVISO DE PARADA (2026-08-18).
                O modo como este cartão falha é ficar parado: o robô se recusa a mandar quando o
                relatório está sem o filtro "Transportador" — o que é o certo —, e o painel segue
                mostrando o último número, com a cor certa, parecendo atual. Só o carimbo denuncia,
                e carimbo é a linha que ninguém lê. Aqui ele passa a gritar. */}
            {frescor.velho ? (
              <div className="mt-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[0.7rem] font-semibold text-destructive">
                {t("stale", { age: idadeEmTexto(frescor.horas) })}
              </div>
            ) : null}
          </div>
        </div>

        {/* Quatro colunas nas telas largas porque o BSC também usa quatro: cada fileira é um pilar,
            na mesma sequência do relatório. Quem confere os dois lado a lado não precisa procurar. */}
        <ul className="grid min-w-[280px] flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {(minimizado ? resumoNaTela : indicadoresNaTela)(atual.indicators).map((nome) => {
            const valor = atual.indicators[nome]!;
            const premissa: Premissa | undefined = PREMISSAS[nome];
            const faixa = faixaDo(valor, premissa);
            return (
              <li key={nome} className="flex min-w-0 flex-col gap-1.5 rounded-md border p-2.5">
                {/* Duas linhas em vez de reticências: "Atendimento Check List" cortado vira
                    "Atendimento Chec…", e numa TV ninguém passa o mouse para descobrir o resto. */}
                <span
                  title={nome}
                  className="line-clamp-2 min-h-[2.1em] text-[0.72rem] uppercase leading-tight tracking-wide text-muted-foreground"
                >
                  {nome}
                </span>
                <span className="flex items-baseline justify-between gap-1">
                  <span className={`text-xl font-bold leading-none ${TEXTO[faixa]}`}>
                    {valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
                  </span>
                  {premissa ? (
                    /*
                      A META ESCRITA É A `META_EXIBIDA`, e NÃO o `target` da premissa (28/08, a pedido).

                      O `target` continua mandando na cor e na barra — ele é o limiar contratual. Este
                      texto passou a ser o número único que a operação persegue. As duas coisas podem
                      divergir na tela, e o porquê está escrito em `META_EXIBIDA`, com o exemplo do SPOT.

                      Quem for "consertar" isto: leia lá antes. Não é engano.
                    */
                    <span className="text-[0.68rem] text-muted-foreground">
                      {t("target", { value: META_EXIBIDA.toLocaleString("pt-BR") })}
                    </span>
                  ) : null}
                </span>
                <span className="h-[4px] overflow-hidden rounded-sm bg-muted">
                  <span
                    className="block h-full rounded-sm"
                    style={{
                      width: larguraAteAMeta(valor, premissa),
                      backgroundColor: FUNDO[faixa],
                    }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* O rótulo do período sai no cartão encolhido: vira uma linha inteira de rodapé para
          uma informação de conferência, e encolher é justamente dizer "hoje não vou conferir". */}
      {atual.periodLabel && !minimizado ? (
        <div className="mt-2 border-t pt-1.5 text-[0.68rem] text-muted-foreground">
          {atual.periodLabel}
        </div>
      ) : null}
    </Card>
  );
}
