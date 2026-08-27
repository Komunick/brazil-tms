"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import {
  saoPauloDate,
  regionPosition,
  chaveDaFrente,
  type TripDisplayStatus,
} from "@brazil-tms/shared";
import type { RegionSlice } from "@brazil-tms/db";
import { Role } from "@brazil-tms/shared";
import { useDashboardSummary } from "@/lib/trips/client";
import { useReconexao } from "@/lib/ui/reconexao";
import { usePainelDoUsuario } from "@/lib/ui/painel-do-usuario";
import { cn } from "@/lib/utils";
import { BscCard } from "@/components/trips/dashboard/bsc-card";
import {
  CardDaFrente,
  TotaisDoQuadro,
  type DadosDaFrente,
} from "@/components/trips/dashboard/frente";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * O PAINEL DO DIA — um cartão por frente, e mais nada (2026-08-27, a pedido).
 *
 * Os dados vêm do `useDashboardSummary` (recarga de 60s pelo TanStack Query — NUNCA Realtime, é
 * restrição da constituição). Cada frente desenha UM cartão com os quatro grupos da planilha da
 * operação — PLAN, ORIGEM, SPOT e TENDÊNCIA —, e embaixo deles a faixa que os soma.
 *
 * ── O QUE SAIU DAQUI, E POR QUÊ ───────────────────────────────────────────────────────────────
 *
 * Havia mais três quadros por status (hoje, amanhã e o mês) e dois números soltos (risco de SLA e
 * aguardando atribuição). Saíram inteiros nesta data: eles respondiam perguntas de OUTRA escala —
 * o mês, o país — e viravam uma terceira leitura competindo com as duas que a operação usa.
 *
 * Nada disso deixou de ser medido: os recortes continuam vindo do servidor e vivem na Torre de
 * Controle, que é onde se AGE sobre eles. Aqui só se olha.
 *
 * NÚMERO NENHUM É INVENTADO — o que o read model não mede não aparece. É por isso que TENDÊNCIA
 * mostra travessão em vez de zero: zero é uma afirmação, e não há de onde tirá-la ainda.
 */

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

/**
 * A FRENTE "SEM REGIÃO" É CARD DE ADMINISTRAÇÃO (2026-08-27, a pedido).
 *
 * Ela não é uma frente: é o balde de tudo que não casou com o cadastro — estação sem região
 * preenchida, e oferta de spot cuja estação não está no cadastro. Para quem opera, é ruído com
 * cara de frente; para quem administra, é a lista de trabalho de cadastro.
 *
 * ── O QUE ISSO CUSTA, DITO EM VOZ ALTA ────────────────────────────────────────────────────────
 *
 * As ofertas de spot de estação fora do cadastro caem nesta frente, e são MUITAS: medido em
 * produção, 40 de 95 ofertas (42%) não casam com nenhuma estação. Escondendo o card, quem não é
 * admin deixa de vê-las no painel. Elas continuam apitando na TV e indo para o Telegram — a perda
 * é só aqui, e foi decisão consciente de quem pediu.
 *
 * O caminho para reduzir isso não é a tela: é cadastrar a estação, e aí a oferta passa a cair na
 * frente certa e aparece para todo mundo. Por isso o card sobra justamente para quem cadastra.
 */
export function DashboardWidgets({ papel }: { papel: Role }) {
  const ehAdmin = papel === Role.Admin;
  const t = useTranslations("Trips.dashboard");
  const tCommon = useTranslations("Common");
  const tBsc = useTranslations("Bsc");
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

  const hoje = saoPauloDate();
  const amanha = saoPauloDate(1);
  const depoisDeAmanha = saoPauloDate(2);

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
  // A janela de aviso — "deveria ter chegado e ainda dá tempo". Ver `origemRiscoSql`.
  const origemRiscoDe = new Map(summary.origemAtrasadaByRegion.map((r) => [r.region, r.risco]));
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
  /**
   * A FRENTE QUE SÓ TEM SPOT TAMBÉM GANHA CARD (2026-08-27).
   *
   * A união acima vem dos três dias de VIAGEM. Bastava enquanto o spot tinha cartão próprio; com
   * ele dobrado para dentro do card da frente, uma frente com oferta e sem viagem nenhuma no
   * horizonte não teria onde aparecer — e a oferta sumiria da tela sem nada explicando.
   *
   * O caso não é hipotético: a oferta cuja estação não está no cadastro cai na frente NULA, e num
   * dia sem viagem de frente nula esse card não existiria.
   */
  for (const { region } of summary.spotByRegion) {
    if (!porRegiao.has(region)) porRegiao.set(region, {});
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
   * A frente nula sai da lista inteira quando quem olha não administra — ver o cabeçalho do
   * componente. Sai ANTES do catálogo de propósito: um cartão desligável que a pessoa não pode
   * ver seria um interruptor para nada.
   */
  const regioesComCard = ehAdmin
    ? regioesDosTresDias
    : regioesDosTresDias.filter((r) => r.region !== null);

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
    ...regioesComCard.map(({ region }) => ({
      chave: chaveDaFrente(region),
      rotulo: region ?? t("regionUnassigned"),
    })),
  ];
  const escondido = (chave: string) => escondidos.has(chave);
  const frentesVisiveis = regioesComCard.filter((r) => !escondido(chaveDaFrente(r.region)));

  /**
   * OS DADOS DE CADA FRENTE, montados UMA vez.
   *
   * Os cards desenham a partir deste array e a faixa de totais soma ELE — não o payload de novo.
   * Duas contas sobre a mesma pergunta é a porta clássica para o total dizer um número e as parcelas
   * outro, com nenhum dos dois parecendo errado sozinho.
   *
   * O PLAN soma D1 e D2: a planilha tem dois números, não quatro. Os dois dias continuam chegando
   * separados do servidor — separar de novo é outra soma aqui, não uma consulta nova.
   */
  const dadosDasFrentes: DadosDaFrente[] = frentesVisiveis.map(({ region, dias }) => {
    const de = (chave: string) => dias.find((d) => d.diaKey === chave);
    const hoje = de("regionToday");
    const plano = new Map<TripDisplayStatus, number>();
    for (const dia of [de("regionD1"), de("regionD2")]) {
      for (const s of dia?.byStatus ?? []) {
        plano.set(s.status, (plano.get(s.status) ?? 0) + s.count);
      }
    }
    return {
      region,
      plano: [...plano.entries()].map(([status, count]) => ({ status, count })),
      origemRisco: origemRiscoDe.get(region) ?? 0,
      origemFora: hoje?.origemAtrasada ?? 0,
      spot: hoje?.spot,
    };
  });

  return (
    <div className="space-y-2.5">
      {/**
       * O TÍTULO MORA AQUI, junto do botão (2026-08-23, a pedido).
       *
       * O `Personalizar` flutuava sozinho entre o subtítulo e o primeiro cartão, e lia como um
       * elemento perdido: não pertencia ao cabeçalho nem ao conteúdo. O lugar dele é a linha do
       * título, que é onde se procura o que age sobre a tela inteira.
       *
       * Para isso o cabeçalho desceu do `page.tsx` para cá. É a troca: a página perde duas linhas
       * renderizadas no servidor, e o botão ganha um lugar que se explica sozinho.
       *
       * ELE CONTINUA DISCRETO, e o argumento não mudou: personalizar é coisa que se faz UMA vez; o
       * painel é coisa que se olha o dia inteiro. Botão em destaque competiria com os números por
       * causa de um clique por pessoa — e este painel também vive numa TV, onde ninguém clica.
       */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
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
      </header>
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
         * A FAIXA DE TOTAIS, LOGO ABAIXO DO BSC (2026-08-27, a pedido — subiu no mesmo dia).
         *
         * Ela nasceu no PÉ do quadro, embaixo das frentes, pela ordem natural de uma planilha: as
         * parcelas e então a soma. Subiu porque esta tela não é uma planilha que se confere de baixo
         * para cima — é um painel que se olha de longe e de relance, e a primeira pergunta de quem
         * levanta a cabeça é "como está a operação hoje", não "como está a frente SULCO".
         *
         * Com o total em cima, a leitura vira do todo para a parte: o número da operação primeiro, e
         * as frentes embaixo explicando de onde ele veio. Quem quer só o resumo para de ler na
         * primeira linha.
         *
         * ELA SOMA O QUE OS CARDS MOSTRAM — o mesmo array, não uma segunda conta sobre o payload.
         * Somar por fora abriria a porta clássica: o total dizendo um número e as parcelas outro, com
         * nenhum dos dois parecendo errado sozinho.
         *
         * Some quando não há frente nenhuma: um total de zeros sozinho na tela é ruído.
         */}
        {dadosDasFrentes.length > 0 ? (
          <div className="col-span-full">
            <TotaisDoQuadro frentes={dadosDasFrentes} />
          </div>
        ) : null}

        {/**
         * AS FRENTES, COM AS COLUNAS DO QUADRO BRANCO (2026-08-27, a pedido).
         *
         * Eram nove cartões — três frentes × três dias —, e cada célula respondia "como está esta
         * frente neste dia". Agora é uma linha por frente com as colunas do quadro que a operação já
         * desenha: PLAN, ORIGEM, SPOT, TENDÊNCIA. Cada coluna faz uma pergunta só, e a mesma em toda
         * frente — que é como se lê um quadro: descendo a coluna, não varrendo a linha.
         *
         * A ordem entre elas vem do servidor (`REGION_ORDER`), não do alfabeto: num painel de parede a
         * posição da linha é como as pessoas a encontram.
         *
         * O detalhe de HOJE saiu junto (ETA Origem, Em trânsito, Concluída, Cancelada). Foi o custo
         * declarado da troca, e ele está escrito em `frente.tsx` com o caminho de volta.
         */}
        {dadosDasFrentes.map((dados) => (
          <div key={dados.region ?? "__sem_regiao__"} className="col-span-full">
            <CardDaFrente dados={dados} />
          </div>
        ))}

        {/*
          E MAIS NADA. Saíram daqui, em 27/08 e a pedido, os três quadros por status (hoje, amanhã,
          mês), os dois números soltos (risco de SLA e aguardando atribuição) e o cartão "Ofertas de
          spot hoje" — este último não foi apagado: virou a lista que abre no grupo SPOT de cada
          frente, com hora, preço, STA e veículo.

          A razão é a mesma que já tinha tirado a superfície de alertas daqui: o painel do dia é o
          quadro da OPERAÇÃO, e os cards de baixo respondiam perguntas de outra escala — o mês inteiro,
          o país inteiro. Com o total em cima e o quadro por frente embaixo, eles viravam uma terceira
          leitura competindo com as duas que a operação de fato usa.

          Nada deixou de ser medido: os três recortes por status continuam vindo do servidor e vivem
          na Torre de Controle, que é onde se age sobre eles.
        */}

      </div>
    </div>
  );
}
