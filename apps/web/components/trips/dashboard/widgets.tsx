"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import {
  boardQueryForDisplayStatus,
  saoPauloDate,
  saoPauloMonthBounds,
  regionPosition,
  chaveDaFrente,
  TRIP_DISPLAY_ORDER,
  type TripDisplayStatus,
} from "@brazil-tms/shared";
import type { DashboardSummary, RegionSlice } from "@brazil-tms/db";
import { useDashboardSummary } from "@/lib/trips/client";
import { useReconexao } from "@/lib/ui/reconexao";
import { usePainelDoUsuario } from "@/lib/ui/painel-do-usuario";
import { useMudou } from "@/lib/ui/mudou";
import { cn } from "@/lib/utils";
import { TripStatusBadge } from "@/components/trips/trip-status-badge";
import { BOARD_ANCHOR } from "@/components/trips/control-tower-table";
import { BscCard } from "@/components/trips/dashboard/bsc-card";
import { OfertasDoDia } from "@/components/spot/ofertas-do-dia";
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
 * O aperto veio em três rodadas, todas a pedido. Na segunda, o que sobrava era espaço VAZIO dentro do
 * cartão: o "ver no quadro" ocupava uma terceira linha só para repetir, em todos eles, a mesma frase.
 * O cartão INTEIRO virou o link — a área clicável cresce e a frase some.
 *
 * Na terceira, o que restava não era altura demais: era ESTICAMENTO. Estes cartões dividem a linha do
 * grid com os quadros de status, que são altos por natureza (uma linha por status), e o item de grid
 * cresce até a altura da linha. Um número de três dígitos ficava boiando num retângulo do tamanho de
 * uma lista de dez status.
 *
 * Duas mudanças resolvem, e nenhuma delas é diminuir a fonte:
 *
 *   NÃO ESTICAR — o cartão passa a ter a altura do próprio conteúdo. É a correção de verdade; o
 *   resto seria maquiagem em cima de um retângulo que continuaria grande. Quem segura isso hoje é o
 *   `self-start` da COLUNA que os empilha (ver `DashboardWidgets`), e não cada cartão: dentro de uma
 *   coluna flex, `self-start` no cartão encolheria a LARGURA dele, que é o eixo errado.
 *
 *   Rótulo e número na MESMA linha. Com o cartão livre para encolher, empilhar os dois em duas linhas
 *   só desperdiçava a largura que sobra ao lado de um número curto.
 */
/**
 * UM NÚMERO QUE ACENDE QUANDO MUDA (2026-08-23, a pedido).
 *
 * O painel se recarrega sozinho e as contagens trocavam em silêncio — numa TV, a mudança
 * acontecia enquanto ninguém olhava, e o que mudou não se distinguia do que sempre esteve ali.
 *
 * O brilho herda a COR DO PRÓPRIO NÚMERO (ver `.realce-aceso`): a atrasada pisca vermelho, o em
 * trânsito pisca verde. Nenhuma cor nova entra na tela — a que já existe é que ganha um instante
 * de ênfase.
 */
function Numero({ valor, className }: { valor: number; className?: string }) {
  const aceso = useMudou(valor);
  return <span className={cn("tabular-nums", aceso && "realce-aceso", className)}>{valor}</span>;
}

function MetricCard({ titleKey, value, href, placeholder }: MetricCardProps) {
  const t = useTranslations("Trips.dashboard");

  const conteudo = (
    <div className="flex items-center justify-between gap-2">
      <CardTitle className="text-[0.68rem] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
        {t(titleKey)}
      </CardTitle>
      {placeholder ? (
        <span className="shrink-0 text-xs text-muted-foreground">{t("placeholder")}</span>
      ) : (
        <span className="shrink-0 text-xl font-semibold leading-none tabular-nums">{value}</span>
      )}
    </div>
  );

  if (href && !placeholder) {
    return (
      <Card className="p-0 transition-colors hover:bg-muted/60">
        <Link href={href} className="block px-2.5 py-2" title={t("viewInBoard")}>
          {conteudo}
        </Link>
      </Card>
    );
  }
  return <Card className="px-2.5 py-2">{conteudo}</Card>;
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
const STATUS_OCULTOS = new Set<TripDisplayStatus>([
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
  extraFilter = "",
}: {
  byStatus: DashboardSummary["tripsTodayByStatus"];
  emptyKey: string;
  /** O trecho de data do link — o MESMO recorte que o cartão contou. */
  dateFilter: string;
  /** Recorte extra do link (hoje, a região). Vazio no cartão que conta o país inteiro. */
  extraFilter?: string;
}) {
  const t = useTranslations("Trips.dashboard");
  // A ordem é a do ciclo de vida, não a do banco: quem lê espera Recebida antes de Em trânsito, e
  // um quadro que reordena a cada atualização obriga a procurar de novo o que já se sabia onde era.
  const ordenadas = byStatus
    .filter((s) => !STATUS_OCULTOS.has(s.status))
    .sort((a, b) => TRIP_DISPLAY_ORDER.indexOf(a.status) - TRIP_DISPLAY_ORDER.indexOf(b.status));

  if (ordenadas.length === 0) {
    return <p className="text-xs text-muted-foreground">{t(emptyKey)}</p>;
  }

  /**
   * A BARRA DE PROPORÇÃO ATRÁS DE CADA LINHA (2026-08-23, a pedido).
   *
   * A linha era `[etiqueta] .......... 39`: o olho viajava o cartão inteiro e ainda tinha de
   * comparar de cabeça. Num cartão de 39 viagens, "11 canceladas" e "9 em trânsito" pareciam a
   * mesma coisa até alguém ler os dois números.
   *
   * A barra é a FATIA DO TOTAL do cartão, e não a fatia do maior status. Comparar com o maior
   * encheria uma barra sempre até o fim e diria só quem é o campeão; com o total, a barra responde
   * a pergunta que a operação faz — quanto do dia está parado nisto.
   *
   * Ela não tem cor própria: é uma sombra do texto, e a cor semântica continua onde já estava, na
   * etiqueta. Duas coisas coloridas na mesma linha competiriam, e a etiqueta já ganhou essa
   * disputa quando as cores foram escolhidas.
   *
   * O denominador é o do CARTÃO, não o do painel: cada cartão é um dia, e comparar a fatia de hoje
   * com a fatia do mês seria comparar réguas diferentes desenhadas do mesmo jeito.
   */
  const total = ordenadas.reduce((n, s) => n + s.count, 0);

  return (
    <ul className="space-y-1">
      {ordenadas.map(({ status, count }) => (
        <li key={status}>
          <Link
            href={`/trips?${boardQueryForDisplayStatus(status)}${dateFilter}${extraFilter}&scope=all#${BOARD_ANCHOR}`}
            className="relative flex items-center justify-between gap-2 overflow-hidden rounded px-1 py-0.5 hover:bg-muted"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 rounded bg-foreground/[0.07]"
              style={{ width: total === 0 ? 0 : `${(count / total) * 100}%` }}
            />
            <span className="relative">
              <TripStatusBadge status={status} />
            </span>
            <Numero valor={count} className="relative text-sm font-semibold" />
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
        <Numero valor={total} className="text-sm font-semibold" />
      </div>
      <StatusList byStatus={byStatus} emptyKey={emptyKey} dateFilter={dateFilter} />
    </Card>
  );
}

/**
 * Um quadro de status recortado por REGIÃO, no dia de hoje (2026-08-20, a pedido).
 *
 * A operação é dividida em três frentes, e quem cuida de uma não consegue ler o número somado: doze
 * viagens em análise não dizem se o problema é seu ou de outra frente. Cada cartão responde a mesma
 * pergunta do cartão de hoje, só que para uma frente.
 *
 * Reaproveita `StatusList`, e isso é o ponto: a lista, a ordem dos status, o que fica oculto e o
 * formato do link são exatamente os do cartão de hoje. Um componente próprio divergiria no primeiro
 * ajuste de estilo, e aí duas listas que respondem a mesma pergunta pareceriam responder a duas.
 *
 * O link carrega `region=` — o MESMO filtro que a consulta agrupou. É o que garante que o número do
 * cartão e o total da lista sejam o mesmo número.
 */
function RegionCard({
  region,
  byStatus,
  dateFilter,
  diaKey,
  atrasadas = 0,
  origemAtrasada = 0,
  spot,
}: {
  region: string | null;
  byStatus: DashboardSummary["tripsTodayByStatus"];
  dateFilter: string;
  /** `hoje`, `d1` ou `d2` — entra no título e decide se o prazo já pode ter vencido. */
  diaKey: "regionToday" | "regionD1" | "regionD2";
  /**
   * Quantas viagens deste cartão passaram do prazo de atribuição. Só o cartão de HOJE recebe número
   * aqui: D1 e D2 têm o prazo inteiro pela frente, e pintar de vermelho o que tem um dia de folga
   * ensina a operação a ignorar vermelho.
   */
  atrasadas?: number;
  /**
   * Quantas viagens deste cartão já passaram do prazo de CHEGADA NA ORIGEM — coleta menos duas
   * horas. Vizinha de `atrasadas` e diferente dela: aquela é "ninguém foi escalado", esta é "foi
   * escalado e não chegou". Duas falhas, duas ações — atribuir contra ligar para o motorista.
   *
   * Só o cartão de HOJE recebe: uma viagem de amanhã tem o prazo inteiro pela frente.
   */
  origemAtrasada?: number;
  /** O leilão de spot da frente nas últimas 24h, para o rodapé do cartão. */
  spot?: { aceito: number; naoAceito: number };
}) {
  const t = useTranslations("Trips.dashboard");
  const total = byStatus.reduce((n, s) => n + s.count, 0);
  /**
   * Estação sem região não tem para onde o link apontar — `region=` vazio traria o país inteiro, e um
   * cartão que abre uma lista maior que ele próprio é pior do que um que não abre. Esse grupo existe
   * para ser visto e resolvido no cadastro, não para ser navegado.
   */
  const extraFilter = region ? `&region=${encodeURIComponent(region)}` : "";

  /**
   * HOJE PESA MAIS QUE AMANHÃ (2026-08-23, a pedido).
   *
   * Os nove cartões eram idênticos, e não são a mesma coisa: hoje é o que se resolve agora; D1 e
   * D2 são planejamento, e olhar para eles é uma decisão, não o padrão. Com o mesmo peso, os três
   * disputavam a mesma atenção e a linha inteira virava uma parede uniforme.
   *
   * A diferença é de SUPERFÍCIE, não de cor: os de amanhã e depois recuam para o fundo cinza e o
   * título fica apagado; o de hoje continua sendo um cartão branco, com o título em tinta cheia e o
   * total um degrau maior. Nada foi escondido e nenhuma cor nova entrou — o vermelho e o laranja
   * continuam significando só o que significavam.
   */
  const eHoje = diaKey === "regionToday";

  return (
    <Card className={cn("p-2.5", !eHoje && "border-transparent bg-muted/40 shadow-none")}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <CardTitle
          className={cn(
            "text-[0.68rem] font-medium uppercase leading-tight tracking-wide",
            eHoje ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {region ? t(diaKey, { region }) : t("regionUnassigned")}
        </CardTitle>
        <Numero
          valor={total}
          className={cn("font-semibold", eHoje ? "text-base" : "text-sm text-muted-foreground")}
        />
      </div>
      {/**
       * A LH ATRASADA, piscando (2026-08-20, a pedido).
       *
       * A regra da operação: a viagem pode ser atribuída até o MEIO-DIA do próprio dia da coleta.
       * Depois disso, sem ninguém escalado, é atraso — e numa TV isso precisa ser visto sem
       * procurar. Falta ACEITAR e falta ESCALAR contam as duas (2026-08-23): são duas pendências
       * nossas, com ações diferentes e a mesma consequência.
       *
       * VERMELHO CHEIO, com brilho (2026-08-20, a pedido): fundo sólido em vez de tinta clara, e um
       * halo em volta. Numa TV vista de longe, borda fina com fundo pálido some entre doze cartões —
       * e um aviso que só é visto por quem já está procurando não é aviso.
       *
       * `motion-safe:` no pisca, e não animação crua: quem configurou o sistema para reduzir
       * movimento continua vendo a faixa vermelha, só que parada. O aviso é a COR e o número; o
       * pisca é reforço, e reforço não pode ser a única forma de perceber.
       */}
      {atrasadas > 0 ? (
        <Link
          href={`/trips?lateToAssign=true${extraFilter}&scope=all#${BOARD_ANCHOR}`}
          className="mb-1.5 flex items-center justify-between gap-2 rounded bg-destructive px-1.5 py-1 text-xs font-bold uppercase tracking-wide text-destructive-foreground shadow-[0_0_10px_2px_hsl(var(--destructive)/0.75)] motion-safe:animate-pulse"
        >
          <span>{t("lateToAssign")}</span>
          <Numero valor={atrasadas} />
        </Link>
      ) : null}
      {/**
       * A ORIGEM ATRASADA, na MESMA faixa vermelha da de cima (2026-08-22, a pedido).
       *
       * Chegou a existir uma tela própria para isto, com desenho novo, e foi descartada: o cartão
       * já tinha o formato certo e a operação já sabia lê-lo. Reaproveitar a faixa é o oposto de
       * inventar linguagem — duas faixas iguais, uma embaixo da outra, se leem sem aprender nada.
       *
       * O atalho leva à lista pelo MESMO predicado que contou o número (`origemAtrasada=true`),
       * e SEM recorte de data: a regra já traz a sua própria janela. Passar a data do cartão por
       * cima faria a lista mostrar menos do que o cartão diz — foi o que acontecia antes, quando
       * o atalho mandava a fila inteira do dia.
       */}
      {origemAtrasada > 0 ? (
        <Link
          href={`/trips?origemAtrasada=true${extraFilter}&scope=all#${BOARD_ANCHOR}`}
          className="mb-1.5 flex items-center justify-between gap-2 rounded bg-destructive px-1.5 py-1 text-xs font-bold uppercase tracking-wide text-destructive-foreground shadow-[0_0_10px_2px_hsl(var(--destructive)/0.75)] motion-safe:animate-pulse"
        >
          <span>{t("origemAtrasada")}</span>
          <Numero valor={origemAtrasada} />
        </Link>
      ) : null}
      <StatusList
        byStatus={byStatus}
        emptyKey="emptyRegion"
        dateFilter={dateFilter}
        extraFilter={extraFilter}
      />
      {/**
       * O SPOT EM LARANJA, no rodapé do cartão (2026-08-23, a pedido).
       *
       * Nasceu como uma linha de texto cinza, com o argumento de que é oportunidade e não pendência
       * — ninguém PRECISA agir por causa dela. O argumento continua de pé e é justamente por isso
       * que ela é laranja e não vermelha: chama sem cobrar, e não pisca. As duas faixas que piscam
       * continuam sendo as únicas que exigem alguém.
       *
       * Some quando não houve leilão nenhum na frente: uma linha de zeros repetida em quatro
       * cartões é ruído que ensina a não ler o rodapé.
       */}
      {spot && spot.aceito + spot.naoAceito > 0 ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 rounded border border-[hsl(28_75%_78%)] bg-[hsl(30_95%_93%)] px-1.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-[hsl(22_80%_34%)] dark:border-[hsl(28_50%_34%)] dark:bg-[hsl(26_55%_18%)] dark:text-[hsl(30_90%_72%)]">
          <span>{t("spotRotulo")}</span>
          <span className="tabular-nums">
            {t("spotNumeros", { aceito: spot.aceito, passou: spot.naoAceito })}
          </span>
        </div>
      ) : null}
    </Card>
  );
}
/**
 * O PAINEL DE CADA UM (2026-08-23, a pedido).
 *
 * Quem cuida de uma frente olhava nove cartões de região para usar três. Aqui a pessoa desliga o
 * que não é dela, e a escolha fica gravada nela — não no navegador, porque a operação divide
 * máquina e o segundo a sentar desfaria a escolha do primeiro sem perceber.
 *
 * ── ESCONDER, E NÃO REORDENAR ─────────────────────────────────────────────────────────────────
 *
 * É a primeira etapa de propósito. O incômodo medido é RUÍDO — cartão que não é meu —, e esconder
 * resolve isso com um clique, sem biblioteca de arrastar, sem ordem guardada e sem a pergunta
 * "onde foi parar o cartão?" que arrastar cria. Se depois de rodar faltar mover, mover encaixa em
 * cima disto sem desfazer nada.
 *
 * ── PASTILHA, E NÃO CAIXA DE MARCAR ───────────────────────────────────────────────────────────
 *
 * Vinte caixas de marcar empilhadas viram um formulário; as pastilhas cabem em três linhas e se
 * leem de relance. Continua sendo um `role="switch"` de verdade — o leitor de tela anuncia ligado
 * ou desligado, e a tecla de espaço alterna, coisas que um `div` clicável perderia.
 */
function PainelPersonalizar({
  itens,
  escondidos,
  alternar,
  restaurarPadrao,
}: {
  itens: { chave: string; rotulo: string }[];
  escondidos: Set<string>;
  alternar: (chave: string) => void;
  restaurarPadrao: () => void;
}) {
  const t = useTranslations("Trips.dashboard");
  const algoEscondido = itens.some((i) => escondidos.has(i.chave));

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <CardTitle className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
          {t("personalizarTitulo")}
        </CardTitle>
        {/* Só aparece quando há o que restaurar: um botão que não faz nada ensina a não ler botão. */}
        {algoEscondido ? (
          <button
            type="button"
            onClick={restaurarPadrao}
            className="rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("restaurarPadrao")}
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {itens.map(({ chave, rotulo }) => {
          const visivel = !escondidos.has(chave);
          const Icone = visivel ? Eye : EyeOff;
          return (
            <button
              key={chave}
              type="button"
              role="switch"
              aria-checked={visivel}
              onClick={() => alternar(chave)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                visivel
                  ? "border-primary/30 bg-primary/10 text-foreground hover:bg-primary/15"
                  : "border-dashed border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Icone className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
              {rotulo}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[0.68rem] leading-snug text-muted-foreground">
        {t("personalizarAjuda")}
      </p>
    </Card>
  );
}

export function DashboardWidgets() {
  const t = useTranslations("Trips.dashboard");
  const tCommon = useTranslations("Common");
  const tBsc = useTranslations("Bsc");
  const tSpot = useTranslations("Spot");
  const { data, isLoading, isError } = useDashboardSummary();
  // O painel de cada um: quais cartões esta pessoa escondeu. Ver `usePainelDoUsuario`.
  const { escondidos, minimizados, alternar, alternarMinimizado, restaurarPadrao } =
    usePainelDoUsuario();
  const [personalizando, setPersonalizando] = useState(false);
  // Numa TV, a queda de um deploy não pode apagar a tela — e a volta tem que trazer a versão nova
  // sem ninguém dar F5. Ver `useReconexao`.
  const { desatualizado } = useReconexao(isError);

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

  /**
   * A mensagem de erro só entra quando NÃO HÁ o que mostrar.
   *
   * Era `isError || !data`, e o `isError` sozinho apagava a tela inteira: bastava uma leitura falhar
   * — um deploy de dois minutos, um engasgo de rede — para os números somarem e virarem um aviso
   * vermelho. Numa televisão isso é o pior desfecho possível: quem passa na sala perde a informação
   * toda por causa de uma falha temporária que ninguém ali pode resolver.
   *
   * Com dado em mãos, a tela continua mostrando o último retrato bom e DIZ que está velho. Sem dado
   * nenhum, aí sim o erro é a única coisa honesta a exibir.
   */
  if (!data) {
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

  // Risco de SLA em cima, fila do despacho embaixo (2026-08-19, a pedido). É a ordem da urgência: o
  // risco tem hora marcada, a fila espera decisão.
  const cartoes: MetricCardProps[] = [
    metric("tripsAtRisk", summary.tripsAtRisk, (n) => n, atRiskHref),
    metric("awaitingAssignment", summary.awaitingAssignment, (n) => n, awaitingAssignmentHref),
  ];

  const hoje = saoPauloDate();
  const amanha = saoPauloDate(1);
  const depoisDeAmanha = saoPauloDate(2);
  const mes = saoPauloMonthBounds();

  /**
   * As três frentes com os três dias de cada uma, na ordem que o servidor mandou.
   *
   * A UNIÃO das regiões vem dos três recortes, não só do de hoje: uma frente pode não ter viagem
   * hoje e ter amanhã, e ela precisa aparecer — um cartão faltando é indistinguível de uma frente
   * que não existe.
   *
   * `atrasadas` só é calculado para HOJE, e só depois do meio-dia: é a regra da operação, e é o
   * único cartão em que o prazo pode ter vencido.
   */
  /**
   * As atrasadas vêm do SERVIDOR, por frente. O cálculo local sabia olhar só "hoje" e perdia a
   * viagem de ontem que ninguém atribuiu — que é justamente a que mais precisa aparecer.
   */
  const atrasadasDe = new Map(summary.lateToAssignByRegion.map((r) => [r.region, r.count]));
  const origemAtrasadaDe = new Map(summary.origemAtrasadaByRegion.map((r) => [r.region, r.count]));
  const spotDe = new Map(summary.spotByRegion.map((r) => [r.region, r]));
  const porRegiao = new Map<string | null, Record<string, RegionSlice["byStatus"]>>();
  for (const [chave, lista] of [
    ["regionToday", summary.tripsTodayByRegion],
    ["regionD1", summary.tripsD1ByRegion],
    ["regionD2", summary.tripsD2ByRegion],
  ] as const) {
    for (const { region, byStatus } of lista) {
      const atual = porRegiao.get(region) ?? {};
      atual[chave] = byStatus;
      porRegiao.set(region, atual);
    }
  }
  const filtroDe: Record<string, string> = {
    regionToday: `&pickupFrom=${hoje}&pickupTo=${hoje}`,
    regionD1: `&pickupFrom=${amanha}&pickupTo=${amanha}`,
    regionD2: `&pickupFrom=${depoisDeAmanha}&pickupTo=${depoisDeAmanha}`,
  };
  /**
   * A ORDEM É REORDENADA AQUI TAMBÉM, e não é redundância.
   *
   * O servidor devolve cada recorte na ordem declarada, mas o mapa acima é preenchido percorrendo os
   * três dias: uma frente que não tem viagem hoje e tem amanhã entra na volta do D1 e ficaria no fim,
   * fora de ordem. Num painel de parede a posição da linha é como as pessoas a encontram.
   */
  const regioesDosTresDias = [...porRegiao.entries()]
    .sort(([a], [b]) => regionPosition(a) - regionPosition(b))
    .map(([region, porDia]) => ({
      region,
      dias: (["regionToday", "regionD1", "regionD2"] as const).map((diaKey) => {
        const byStatus = porDia[diaKey] ?? [];
        return {
          diaKey,
          byStatus,
          dateFilter: filtroDe[diaKey]!,
          // A faixa mora no cartão de HOJE, mas o número não é só de hoje: acumula o que venceu antes.
          atrasadas: diaKey === "regionToday" ? (atrasadasDe.get(region) ?? 0) : 0,
          // Mesma regra: quem tem coleta amanhã ainda tem o prazo inteiro pela frente.
          origemAtrasada: diaKey === "regionToday" ? (origemAtrasadaDe.get(region) ?? 0) : 0,
          // O leilão é de agora; repetir o mesmo número em três cartões diria três vezes a mesma coisa.
          spot: diaKey === "regionToday" ? spotDe.get(region) : undefined,
        };
      }),
    }));

  /**
   * O CATÁLOGO DE CARTÕES do editor — montado do que esta tela REALMENTE desenhou.
   *
   * Não é uma lista fixa em outro arquivo, e isso é o que impede a divergência: um cartão que sai
   * do painel sai daqui junto, e um que entra aparece para ser desligado sem ninguém lembrar de
   * cadastrá-lo. As frentes vêm inteiras (as três, mesmo as escondidas), senão desligar uma seria
   * um caminho sem volta.
   */
  const itensDoPainel: { chave: string; rotulo: string }[] = [
    ...(bsc.length > 0 ? [{ chave: "bsc", rotulo: tBsc("source") }] : []),
    ...regioesDosTresDias.map(({ region }) => ({
      chave: chaveDaFrente(region),
      rotulo: region ?? t("regionUnassigned"),
    })),
    { chave: "hoje", rotulo: t("tripsToday") },
    { chave: "amanha", rotulo: t("tripsTomorrow") },
    { chave: "mes", rotulo: t("tripsMonth") },
    { chave: "spot", rotulo: tSpot("todayTitle") },
    ...cartoes.map((m) => ({ chave: m.titleKey, rotulo: t(m.titleKey) })),
  ];
  const escondido = (chave: string) => escondidos.has(chave);
  const frentesVisiveis = regioesDosTresDias.filter((r) => !escondido(chaveDaFrente(r.region)));
  const numerosVisiveis = cartoes.filter((m) => !escondido(m.titleKey));

  return (
    <div className="space-y-2.5">
      {/**
       * O BOTÃO FICA DISCRETO, no canto, e some do caminho (2026-08-23).
       *
       * Personalizar é coisa que se faz UMA vez; o painel é coisa que se olha o dia inteiro. Um
       * botão em destaque ali em cima competiria com os números todos os dias por causa de um
       * clique por pessoa — e este painel também vive numa TV, onde ninguém vai clicar nele.
       */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setPersonalizando((v) => !v)}
          aria-expanded={personalizando}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
            personalizando
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          {t("personalizar")}
        </button>
      </div>
      {personalizando ? (
        <PainelPersonalizar
          itens={itensDoPainel}
          escondidos={escondidos}
          alternar={alternar}
          restaurarPadrao={restaurarPadrao}
        />
      ) : null}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {/* Uma faixa fina, e só quando há o que avisar: a tela continua inteira, mas quem olhar sabe
          que está vendo um retrato de antes da queda. Volta sozinha quando o servidor voltar. */}
        {desatualizado ? (
          <div
            role="status"
            className="col-span-full flex items-center gap-2 rounded border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning"
          >
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
            {t("reconnecting")}
          </div>
        ) : null}
        {/**
         * O BSC ABRE O PAINEL: é a nota que decide contrato, e vem do cliente, não daqui.
         *
         * Saiu e voltou no mesmo dia (2026-08-20), nas duas vezes a pedido. Fica registrado porque a
         * ida e volta prova o desenho: o cartão nunca dependeu de nada além desta linha e do import —
         * o robô continuou lendo e o payload continuou trazendo o recorte enquanto ele estava fora.
         * Tirar e repor um cartão daqui é decisão de tela, não mudança de sistema.
         */}
        {bsc.length > 0 && !escondido("bsc") ? (
          <BscCard
            snapshots={bsc}
            minimizado={minimizados.has("bsc")}
            onAlternarMinimizado={() => alternarMinimizado("bsc")}
          />
        ) : null}
        {/**
         * A ORDEM É A DO TEMPO: hoje, amanhã, o mês (2026-08-19, a pedido).
         *
         * Os dois números avulsos abriam a fila e empurravam os três quadros para o meio da grade,
         * onde a comparação entre eles — que é a leitura principal desta tela — exigia pular por cima
         * de um cartão de spot no meio do caminho. Agora os três ficam lado a lado, na sequência em
         * que a operação pensa, e o que é avulso vai para o fim.
         */}
        {/**
         * As frentes, logo DEPOIS do total de hoje e antes de amanhã.
         *
         * A ordem conta uma leitura: o número do dia, a quebra desse mesmo número por frente, e só
         * então o dia seguinte. Pôr as regiões no fim obrigaria a voltar à primeira coluna para
         * comparar a parte com o todo.
         *
         * A ordem entre elas vem do servidor (`REGION_ORDER`), não do alfabeto: num painel de parede a
         * posição do cartão é como as pessoas o encontram.
         */}
        {/**
         * TRÊS CARTÕES POR REGIÃO, agrupados por FRENTE e não por dia (2026-08-20, a pedido).
         *
         * Quem cuida de uma frente vê os três dias dela lado a lado — hoje, amanhã, depois. Agrupar
         * por dia espalharia a mesma frente em três lugares da grade e obrigaria a caçar.
         *
         * A ordem das frentes vem do servidor; a dos dias é fixa aqui, porque é a do tempo.
         */}
        {/**
         * UMA LINHA POR FRENTE (2026-08-20, a pedido): NONE em cima, SULCO embaixo, SUDESTE por
         * último — e os três dias de cada uma lado a lado, dentro da faixa dela. A ordem das frentes
         * é a de `REGION_ORDER`, e mudou junto com esta faixa (2026-08-23, a pedido).
         *
         * Uma grade por frente, em vez de deixar os nove cartões fluírem na grade de fora. Fluindo,
         * eles se acomodavam pelo espaço que sobrava e a mesma frente quebrava no meio da tela — quem
         * cuida de uma região perdia a comparação entre os dias dela, que é justamente a leitura que
         * estes cartões existem para dar.
         *
         * QUATRO COLUNAS NA TELA LARGA (2026-08-23, a pedido: "estão meio largos"). A faixa continua
         * sendo da frente inteira, mas os três cartões param de dividir a largura em três: dividem em
         * quatro, e o último quarto fica vazio. É uma diminuição, não um redesenho — e o quarto vazio
         * é o preço de manter a frente empilhada.
         *
         * Chegou a existir aqui uma versão de SEIS colunas com duas frentes por faixa: enchia a tela,
         * e por isso mesmo desfazia o "NONE em cima, SULCO embaixo" que a operação pediu no mesmo dia.
         * Empilhado vale mais do que preenchido.
         */}
        {frentesVisiveis.map(({ region, dias }) => (
          <div
            key={region ?? "__sem_regiao__"}
            className="col-span-full grid grid-cols-1 gap-2.5 sm:grid-cols-3 xl:grid-cols-4"
          >
            {dias.map(({ diaKey, byStatus, dateFilter, atrasadas, origemAtrasada, spot }) => (
              <RegionCard
                key={diaKey}
                region={region}
                byStatus={byStatus}
                dateFilter={dateFilter}
                diaKey={diaKey}
                atrasadas={atrasadas}
                origemAtrasada={origemAtrasada}
                spot={spot}
              />
            ))}
          </div>
        ))}
        {/**
         * OS TRÊS RECORTES DE STATUS JUNTOS — hoje, amanhã, mês (2026-08-20, a pedido).
         *
         * O de hoje abria o painel, sozinho, com as linhas das frentes logo abaixo; e aí a comparação
         * entre hoje, amanhã e o mês — que é a leitura destes três — exigia pular por cima de nove
         * cartões de região. Juntos, eles voltam a ser lidos de uma vez.
         */}
        {!escondido("hoje") ? (
          <StatusCard
            titleKey="tripsToday"
            emptyKey="empty"
            byStatus={summary.tripsTodayByStatus}
            dateFilter={`&pickupFrom=${hoje}&pickupTo=${hoje}`}
          />
        ) : null}
        {/* Amanhã (2026-08-17, a pedido): numa TV no meio da sala, de tarde, a pergunta que ainda tem
          resposta é a do dia seguinte. */}
        {!escondido("amanha") ? (
          <StatusCard
            titleKey="tripsTomorrow"
            emptyKey="emptyTomorrow"
            byStatus={summary.tripsTomorrowByStatus}
            dateFilter={`&pickupFrom=${amanha}&pickupTo=${amanha}`}
          />
        ) : null}
        {/* Trocou o cartão de "Faturamento pendente" (2026-08-17, a pedido): o número do faturamento
          vive na tela de Faturamento, e aqui a pergunta é sobre a operação. */}
        {!escondido("mes") ? (
          <StatusCard
            titleKey="tripsMonth"
            emptyKey="emptyMonth"
            byStatus={summary.tripsByStatus}
            dateFilter={`&pickupFrom=${mes.first}&pickupTo=${mes.last}`}
          />
        ) : null}
        {/* O destino do aviso depois que ele sai do meio da tela: mesma consulta, tamanho de cartão. */}
        {!escondido("spot") ? <OfertasDoDia /> : null}
        {/**
         * OS DOIS NÚMEROS EMPILHADOS numa coluna só (2026-08-19, a pedido), risco de SLA em cima.
         *
         * Eles são cartões de uma linha ao lado de quadros de dez, e enfileirados na horizontal cada um
         * gastava uma coluna inteira da grade para mostrar dois dígitos. Empilhados, os dois ocupam uma
         * coluna e sobra a sexta — que o usuário previu e aceitou: espaço vazio na borda incomoda menos
         * do que um quadro de status espremido.
         *
         * O `self-start` mora AQUI, e não nos cartões: é este item da grade que não pode esticar até a
         * altura da linha. Dentro da coluna, os dois já têm a altura do próprio conteúdo.
         */}
        {numerosVisiveis.length > 0 ? (
          <div className="flex flex-col gap-2.5 self-start">
            {numerosVisiveis.map((m) => (
              <MetricCard key={m.titleKey} {...m} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
