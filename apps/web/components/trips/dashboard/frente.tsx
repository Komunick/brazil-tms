"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import type { TripDisplayStatus } from "@brazil-tms/shared";
import type { MedidaDoPainel } from "@brazil-tms/db";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * O CARD DA FRENTE — o quadro da operação, uma linha por frente (2026-08-27, a pedido).
 *
 * Veio de uma foto da planilha que a operação já mantém: quatro grupos, dois números cada, tudo
 * dentro de UM card por frente.
 *
 *   ┌──── PLAN ────┬───── ORIGEM ─────┬─── SPOT ───┬─ TENDÊNCIA ─┐
 *   │ PEND │ ATRIB │ ATRAS<2H │ FORA  │ Aceita│N Ac│ Aceita│N Ac │
 *   │  31  │  18   │    4     │   8   │   4   │ 0  │   —   │  —  │
 *
 * ── POR QUE UM CARD, E NÃO QUATRO ─────────────────────────────────────────────────────────────
 *
 * Foi o pedido, e a planilha explica: a frente é UMA coisa, e os quatro grupos são recortes dela.
 * Quatro cards lado a lado leriam como quatro assuntos — e o olho teria de reconstruir, a cada
 * linha, que aquilo tudo é a mesma frente.
 *
 * O cabeçalho em dois andares é o que carrega isso: o grupo em cima, colorido; as medidas embaixo.
 * É o desenho da própria planilha, e copiá-lo poupa a operação de aprender uma linguagem nova.
 *
 * ── AS CORES SÃO AS DA PLANILHA ───────────────────────────────────────────────────────────────
 *
 * Azul no PLAN, rosa na ORIGEM, âmbar no SPOT, verde na TENDÊNCIA. Elas AGRUPAM, não classificam:
 * nenhuma delas quer dizer bom ou ruim. Quem diz isso continua sendo o vermelho do número, que é a
 * única cor com significado nesta tela — e é por isso que os tons de grupo são pálidos.
 */

interface PorStatus {
  status: TripDisplayStatus;
  count: number;
}

export interface DadosDaFrente {
  region: string | null;
  /**
   * O PLAN soma D1 e D2.
   *
   * A planilha tem dois números, não quatro: o horizonte de planejamento é "o que vem", não "o que
   * vem amanhã contra depois". O dado dos dois dias continua chegando separado do servidor — quem
   * quiser voltar a separar não precisa de consulta nova.
   */
  plano: PorStatus[];
  origemRisco: number;
  origemFora: number;
  spot?: { aceito: number; naoAceito: number; rotas: { rota: string; aceito: boolean }[] };
}

export function CardDaFrente({ dados }: { dados: DadosDaFrente }) {
  const t = useTranslations("Trips.dashboard");
  const [spotAberto, setSpotAberto] = useState(false);
  /**
   * UMA MEDIDA ABERTA POR VEZ, e clicar de novo fecha.
   *
   * Duas listas abertas no mesmo card empilhariam códigos sem dizer de qual número vieram — e a
   * pergunta que o clique responde é "quais LH estão NESTE número", não "quais estão no card".
   */
  const [medidaAberta, setMedidaAberta] = useState<MedidaDoPainel | null>(null);
  const abrir = (m: MedidaDoPainel) => {
    setSpotAberto(false);
    setMedidaAberta((atual) => (atual === m ? null : m));
  };
  // O spot fecha a lista de LH pelo mesmo motivo: uma coisa aberta por vez dentro do card.
  const abrirSpot = () => {
    setMedidaAberta(null);
    setSpotAberto((x) => !x);
  };
  const { region } = dados;

  const doPlano = new Map(dados.plano.map((s) => [s.status, s.count]));

  const houveSpot = dados.spot && dados.spot.aceito + dados.spot.naoAceito > 0;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-stretch">
        {/* A FRENTE, na lateral — como na planilha, onde o nome fica na coluna A. */}
        <div className="flex w-24 shrink-0 items-center justify-center border-r bg-muted/40 px-2 py-3 text-center text-xs font-bold uppercase tracking-wide">
          {region ?? t("regionUnassigned")}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr>
                <Grupo cols={2} cor="bg-sky-100 dark:bg-sky-950/60">
                  {t("grupoPlan")}
                </Grupo>
                <Grupo cols={2} cor="bg-rose-100 dark:bg-rose-950/50">
                  {t("grupoOrigem")}
                </Grupo>
                <Grupo cols={2} cor="bg-amber-100 dark:bg-amber-950/50">
                  {t("grupoSpot")}
                </Grupo>
                <Grupo cols={2} cor="bg-emerald-100 dark:bg-emerald-950/50">
                  {t("grupoTendencia")}
                </Grupo>
              </tr>
              <tr>
                <Medida>{t("medidaPendAtribuicao")}</Medida>
                <Medida>{t("medidaAtribuida")}</Medida>
                <Medida>{t("medidaAtrasado2h")}</Medida>
                <Medida>{t("medidaForaDoPrazo")}</Medida>
                <Medida>{t("medidaAceita")}</Medida>
                <Medida>{t("medidaNaoAceita")}</Medida>
                <Medida>{t("medidaAceita")}</Medida>
                <Medida>{t("medidaNaoAceita")}</Medida>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Valor
                  valor={doPlano.get("to_assign") ?? 0}
                  onClick={() => abrir("pend")}
                  ativo={medidaAberta === "pend"}
                />
                <Valor
                  valor={doPlano.get("assigned") ?? 0}
                  onClick={() => abrir("atribuida")}
                  ativo={medidaAberta === "atribuida"}
                />
                {/*
                  As duas da ORIGEM ficam VERMELHAS quando têm número — é a única cor com significado
                  nesta tela, e as duas colunas são as únicas em que alguém precisa agir.

                  O atalho vai SEM recorte de data: a regra já traz a sua própria janela, e passar a
                  data por cima faria a lista mostrar menos do que o card diz.
                */}
                <Valor
                  valor={dados.origemRisco}
                  alerta={dados.origemRisco > 0}
                  onClick={() => abrir("risco")}
                  ativo={medidaAberta === "risco"}
                />
                <Valor
                  valor={dados.origemFora}
                  alerta={dados.origemFora > 0}
                  onClick={() => abrir("fora")}
                  ativo={medidaAberta === "fora"}
                />
                {/* O SPOT abre a lista de rotas — ver o painel embaixo da tabela. */}
                <Valor
                  valor={dados.spot?.aceito ?? 0}
                  onClick={houveSpot ? abrirSpot : undefined}
                />
                <Valor
                  valor={dados.spot?.naoAceito ?? 0}
                  onClick={houveSpot ? abrirSpot : undefined}
                />
                {/*
                  TENDÊNCIA ainda não tem dado. As colunas ficam desenhadas mostrando "—", e isso é
                  deliberado: o quadro da operação as tem, e uma tabela que muda de forma quando o
                  dado chegar obrigaria a reaprender a tela. "—" diz "não sei", que é a verdade;
                  zero diria "não houve", que seria mentira.
                */}
                <Valor valor={null} />
                <Valor valor={null} />
              </tr>
            </tbody>
          </table>

          {medidaAberta ? <ListaDeLhs region={region} medida={medidaAberta} /> : null}

          {spotAberto && dados.spot && dados.spot.rotas.length > 0 ? (
            <div className="border-t bg-amber-50/60 px-3 py-2 dark:bg-amber-950/20">
              <p className="mb-1 flex items-center gap-1 text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
                <ChevronDown className="h-3 w-3" aria-hidden />
                {t("grupoSpot")}
              </p>
              <ul className="space-y-0.5">
                {dados.spot.rotas.map((r, i) => (
                  <li key={`${r.rota}-${i}`} className="flex items-start gap-1.5 text-[0.7rem]">
                    {/*
                      O ponto diz se pegamos, e a cor sozinha não bastaria: quem não distingue verde
                      de cinza precisa do título.
                    */}
                    <span
                      className={cn(
                        "mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                        r.aceito ? "bg-emerald-500" : "bg-muted-foreground/40",
                      )}
                      title={r.aceito ? t("medidaAceita") : t("medidaNaoAceita")}
                      aria-label={r.aceito ? t("medidaAceita") : t("medidaNaoAceita")}
                    />
                    <span
                      className={cn("min-w-0 break-words", !r.aceito && "text-muted-foreground")}
                    >
                      {r.rota}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/** O andar de cima do cabeçalho: o nome do grupo, com a cor da planilha. */
function Grupo({ cols, cor, children }: { cols: number; cor: string; children: React.ReactNode }) {
  return (
    <th
      colSpan={cols}
      className={cn(
        "border-b border-l px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wider first:border-l-0",
        cor,
      )}
    >
      {children}
    </th>
  );
}

/** O andar de baixo: o nome da medida. */
function Medida({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-l px-1.5 py-1 text-[0.58rem] font-medium uppercase leading-tight tracking-wide text-muted-foreground first:border-l-0">
      {children}
    </th>
  );
}

/**
 * Uma célula de número.
 *
 * `null` mostra "—", que é diferente de zero: zero afirma que não houve, o traço admite que não se
 * sabe. É a distinção que mantém a TENDÊNCIA honesta enquanto o dado não existe.
 */
function Valor({
  valor,
  href,
  onClick,
  alerta,
  ativo,
}: {
  valor: number | null;
  href?: string;
  onClick?: () => void;
  alerta?: boolean;
  /**
   * A lista DESTE número está aberta embaixo.
   *
   * Sem a marca, com quatro números clicáveis lado a lado, a lista aberta não diz de qual deles
   * veio — e quem clicou em dois seguidos perde a referência do que está lendo.
   */
  ativo?: boolean;
}) {
  const conteudo = (
    <span
      className={cn(
        "block px-1.5 py-2 text-base font-semibold tabular-nums",
        valor === null && "text-muted-foreground/50",
        // Zero fica apagado: um zero em tinta cheia disputa atenção com os números que importam.
        valor === 0 && "text-muted-foreground/50",
        alerta && "text-destructive",
      )}
    >
      {valor === null ? "—" : valor}
    </span>
  );

  const classe = cn("border-l first:border-l-0", ativo && "bg-accent");
  if (href) {
    return (
      <td className={cn(classe, "p-0 transition-colors hover:bg-accent")}>
        <Link href={href} className="block">
          {conteudo}
        </Link>
      </td>
    );
  }
  if (onClick) {
    return (
      <td className={cn(classe, "p-0 transition-colors hover:bg-accent")}>
        <button type="button" onClick={onClick} className="block w-full">
          {conteudo}
        </button>
      </td>
    );
  }
  return <td className={classe}>{conteudo}</td>;
}

/**
 * AS LH POR TRÁS DE UM NÚMERO (2026-08-27, a pedido).
 *
 * "3 pendentes de atribuição" não diz QUAIS — quem opera reconhece a viagem pelo código, e é o
 * código que permite ir atrás dela.
 *
 * ── BUSCA SÓ QUANDO ABRE ──────────────────────────────────────────────────────────────────────
 *
 * As rotas do spot viajam no payload do painel porque são poucas por frente. As LH não: uma frente
 * movimentada traria centenas de códigos, em três frentes, a cada minuto de recarga — para uma
 * lista que quase sempre ninguém abre.
 *
 * `staleTime` alto porque a lista é do instante em que se clicou: recarregá-la sozinha faria linhas
 * sumirem sob o olho de quem está lendo, e o painel atrás já mostra o número vivo.
 */
function ListaDeLhs({ region, medida }: { region: string | null; medida: MedidaDoPainel }) {
  const t = useTranslations("Trips.dashboard");
  const consulta = useQuery({
    queryKey: ["painel-lhs", region, medida],
    queryFn: async () => {
      const p = new URLSearchParams({ medida, region: region ?? "" });
      const res = await fetch(`/api/painel/lhs?${p}`);
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as {
        lhs: { lh: string | null; origem: string | null; destino: string | null; quando: string | null }[];
      };
    },
    staleTime: 60_000,
  });

  const lhs = consulta.data?.lhs ?? [];

  return (
    <div className="border-t bg-muted/30 px-3 py-2">
      <p className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {t(`medida_${medida}`)}
      </p>
      {consulta.isPending ? (
        <p className="text-[0.7rem] text-muted-foreground">{t("carregandoLhs")}</p>
      ) : lhs.length === 0 ? (
        <p className="text-[0.7rem] text-muted-foreground">{t("semLhs")}</p>
      ) : (
        <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
          {lhs.map((v, i) => (
            <li key={`${v.lh}-${i}`} className="flex items-baseline gap-1.5 text-[0.7rem]">
              {/*
                A LH leva ao detalhe da viagem, não ao quadro filtrado: quem clicou num código já
                sabe qual viagem quer — mandá-lo para uma lista seria devolver o trabalho que ele
                acabou de fazer.
              */}
              <Link
                href={`/trips?q=${encodeURIComponent(v.lh ?? "")}&scope=all`}
                className="shrink-0 font-mono font-semibold hover:underline"
              >
                {v.lh ?? "—"}
              </Link>
              <span className="min-w-0 truncate text-muted-foreground">
                {[v.origem, v.destino].filter(Boolean).join(" → ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A FAIXA DE TOTAIS, no pé do quadro (2026-08-27, a pedido).
 *
 * Cada frente responde por si; o total responde pela operação. Quem olha o painel de manhã quer os
 * dois — e sem a soma, ler "3 + 3 + 3" em três cards é uma conta que a tela obriga a pessoa a fazer.
 *
 * ── OS TOTAIS SOMAM O GRUPO, NÃO A MEDIDA ─────────────────────────────────────────────────────
 *
 * "Total pend atribuição E atribuída" é um número só, como a planilha escreve. É a pergunta do
 * total: quanto há para planejar, e quanto está atrasado — não a repartição, que já está em cima.
 */
export function TotaisDoQuadro({ frentes }: { frentes: DadosDaFrente[] }) {
  const t = useTranslations("Trips.dashboard");

  const soma = (f: (d: DadosDaFrente) => number) => frentes.reduce((n, d) => n + f(d), 0);
  const doPlano = (d: DadosDaFrente) => d.plano.reduce((n, s) => n + s.count, 0);

  const totais = [
    { chave: "totalPlan", valor: soma(doPlano), cor: "bg-sky-100 dark:bg-sky-950/60" },
    {
      chave: "totalOrigem",
      valor: soma((d) => d.origemRisco + d.origemFora),
      cor: "bg-rose-100 dark:bg-rose-950/50",
      alerta: true,
    },
    {
      chave: "totalSpot",
      valor: soma((d) => (d.spot?.aceito ?? 0) + (d.spot?.naoAceito ?? 0)),
      cor: "bg-amber-100 dark:bg-amber-950/50",
    },
    // Sem dado, o total é tão desconhecido quanto as parcelas. Zero aqui seria a soma de dois "não sei".
    { chave: "totalTendencia", valor: null, cor: "bg-emerald-100 dark:bg-emerald-950/50" },
  ];

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {totais.map((x) => (
          <div key={x.chave} className="border-b border-l first:border-l-0 lg:border-b-0">
            <p
              className={cn(
                "px-2 py-1 text-center text-[0.62rem] font-bold uppercase tracking-wider",
                x.cor,
              )}
            >
              {t(x.chave)}
            </p>
            <p
              className={cn(
                "py-2 text-center text-2xl font-semibold tabular-nums",
                x.valor === null && "text-muted-foreground/50",
                x.valor === 0 && "text-muted-foreground/50",
                x.alerta && (x.valor ?? 0) > 0 && "text-destructive",
              )}
            >
              {x.valor === null ? "—" : x.valor}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
