"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import type { TripDisplayStatus } from "@brazil-tms/shared";
import type { MedidaDoPainel, SpotDaRegiao } from "@brazil-tms/db";
import { formatTime } from "@brazil-tms/shared";
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
 * única cor com significado nesta tela.
 *
 * OS TONS SUBIRAM UM DEGRAU (2026-08-27, a pedido): de 100 para 200 no claro, e de 950 para 900 no
 * escuro. Nasceram pálidos para não competir com o vermelho, e ficaram pálidos DEMAIS — numa TV
 * vista do outro lado da sala, as quatro faixas se pareciam entre si e o cabeçalho parava de
 * agrupar, que é a única coisa que ele faz.
 *
 * O vermelho continua ganhando: ele mora no NÚMERO, não no fundo, e um número vermelho sobre
 * qualquer um destes quatro tons continua sendo a coisa mais forte da linha.
 *
 * ── E A CAIXA DA FRENTE FICOU MAIS CINZA, no mesmo pedido ─────────────────────────────────────
 *
 * Ela é rótulo, não medida: diz de quem é a linha e não responde nenhuma pergunta. Com as faixas
 * mais fortes ao lado, um cinza mais firme e a letra em tom secundário devolvem a hierarquia —
 * a cor puxa o olho para os números, e o nome fica onde se procura por ele, não onde ele salta.
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
  /**
   * O SPOT traz as OFERTAS inteiras, não só os nomes das rotas (2026-08-27, a pedido).
   *
   * O painel tinha um cartão "Ofertas de spot hoje" à parte com a hora, o preço e os campos da
   * oferta. Ele foi dobrado para dentro deste grupo — e dobrar teria sido perder informação se a
   * lista daqui continuasse mostrando só o nome da rota.
   */
  spot?: Pick<SpotDaRegiao, "aceito" | "naoAceito" | "rotas">;
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
        <div className="flex w-24 shrink-0 items-center justify-center border-r bg-muted px-2 py-3 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {region ?? t("regionUnassigned")}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr>
                <Grupo cols={2} cor="bg-sky-200 dark:bg-sky-900/60">
                  {t("grupoPlan")}
                </Grupo>
                <Grupo cols={2} cor="bg-rose-200 dark:bg-rose-900/50">
                  {t("grupoOrigem")}
                </Grupo>
                <Grupo cols={2} cor="bg-amber-200 dark:bg-amber-900/50">
                  {t("grupoSpot")}
                </Grupo>
                <Grupo cols={2} cor="bg-emerald-200 dark:bg-emerald-900/50">
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
            <ListaDeOfertas ofertas={dados.spot.rotas} />
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
 * AS OFERTAS DE SPOT DA FRENTE — o cartão de baixo, dobrado para cá (2026-08-27, a pedido).
 *
 * O painel tinha um cartão "Ofertas de spot hoje" separado, com a hora, o preço e os campos da
 * oferta. Ele some, e o que ele mostrava passa a abrir AQUI, no grupo SPOT do card da frente.
 *
 * ── POR QUE ISSO É MAIS DO QUE MUDAR DE LUGAR ─────────────────────────────────────────────────
 *
 * O cartão antigo listava as ofertas do dia INTEIRO, misturando as três frentes: para saber de
 * quem era cada uma, era preciso ler o nome da estação na rota. Aqui cada lista já está dentro da
 * frente que a recebeu, e o número que a abriu diz quantas foram.
 *
 * ── E POR QUE ELA VEM DO PAYLOAD, sem busca própria ───────────────────────────────────────────
 *
 * Diferente da lista de LH, que busca ao abrir: são no máximo vinte linhas por frente, o teto já
 * está no servidor, e elas já vinham no payload como nomes de rota. Trazer cinco textos curtos a
 * mais em cada uma é mais barato que a segunda ida ao servidor que uma busca própria custaria.
 *
 * ── O QUE CADA LINHA MOSTRA, E EM QUE ORDEM ───────────────────────────────────────────────────
 *
 * A ordem é a da decisão, a mesma do aviso que sobe na TV: a LH para achar no portal, a rota
 * porque é ela que decide se vale, e só então STA, veículo e preço. A hora de chegada fica à
 * direita porque é por ela que se cruza com o Telegram.
 *
 * CAMPO AUSENTE NÃO VIRA "—": a maioria das ofertas chega sem preço, e uma coluna de travessões
 * repetidos ocuparia a linha inteira para dizer que não há nada a dizer.
 */
function ListaDeOfertas({ ofertas }: { ofertas: SpotDaRegiao["rotas"] }) {
  const t = useTranslations("Trips.dashboard");
  const tSpot = useTranslations("Spot");

  return (
    <div className="border-t bg-amber-50/60 px-3 py-2 dark:bg-amber-950/20">
      <p className="mb-1 flex items-center gap-1 text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
        <ChevronDown className="h-3 w-3" aria-hidden />
        {t("grupoSpot")}
      </p>
      <ul className="grid gap-x-4 gap-y-1 xl:grid-cols-2">
        {ofertas.map((o, i) => {
          // Os três campos secundários numa linha só, separados por ponto. Os ausentes somem.
          const detalhes = [
            o.sta ? `${tSpot("originArrival")} ${o.sta}` : null,
            o.veiculo,
            o.preco,
          ].filter(Boolean);

          return (
            <li key={`${o.rota}-${i}`} className="flex items-start gap-1.5 text-[0.7rem]">
              {/*
                O ponto diz se pegamos, e a cor sozinha não bastaria: quem não distingue verde de
                cinza precisa do título.
              */}
              <span
                className={cn(
                  "mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                  o.aceito ? "bg-emerald-500" : "bg-muted-foreground/40",
                )}
                title={o.aceito ? t("medidaAceita") : t("medidaNaoAceita")}
                aria-label={o.aceito ? t("medidaAceita") : t("medidaNaoAceita")}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("min-w-0 break-words", !o.aceito && "text-muted-foreground")}>
                    {/* A LH leva ao detalhe da viagem — quando ela existe. Oferta não aceita não
                        virou viagem nenhuma, e um link para lista vazia é promessa quebrada. */}
                    {o.lh ? (
                      o.aceito ? (
                        <Link
                          href={`/trips?q=${encodeURIComponent(o.lh)}&scope=all`}
                          className="mr-1.5 font-mono font-semibold hover:underline"
                        >
                          {o.lh}
                        </Link>
                      ) : (
                        <span className="mr-1.5 font-mono font-semibold">{o.lh}</span>
                      )
                    ) : null}
                    {o.rota}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatTime(o.hora)}
                  </span>
                </span>
                {detalhes.length > 0 ? (
                  <span className="block text-[0.65rem] text-muted-foreground">
                    {detalhes.join(" · ")}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
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
    { chave: "totalPlan", valor: soma(doPlano), cor: "bg-sky-200 dark:bg-sky-900/60" },
    {
      chave: "totalOrigem",
      valor: soma((d) => d.origemRisco + d.origemFora),
      cor: "bg-rose-200 dark:bg-rose-900/50",
      alerta: true,
    },
    {
      chave: "totalSpot",
      valor: soma((d) => (d.spot?.aceito ?? 0) + (d.spot?.naoAceito ?? 0)),
      cor: "bg-amber-200 dark:bg-amber-900/50",
    },
    // Sem dado, o total é tão desconhecido quanto as parcelas. Zero aqui seria a soma de dois "não sei".
    { chave: "totalTendencia", valor: null, cor: "bg-emerald-200 dark:bg-emerald-900/50" },
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
