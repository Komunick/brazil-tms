"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
   * O PLAN CHEGA SEPARADO POR DIA — D1 é amanhã, D2 é depois de amanhã.
   *
   * Nasceu somado ("a planilha tem dois números, não quatro"), e o PEND ATRIBUIÇÃO voltou a mostrar
   * os dois em 30/08, a pedido: quem monta o dia seguinte precisa saber quanto do pendente é para
   * AMANHÃ. Um total de 61 não distingue 55 para amanhã de 6 para amanhã, e são dias muito
   * diferentes de trabalho.
   *
   * SÓ O PEND se reparte. ATRIBUÍDA continua somada porque ninguém age sobre ela — é a coluna do que
   * já foi resolvido, e reparti-la só acrescentaria número para o olho filtrar.
   *
   * NÃO existe um `plano` somado ao lado destes dois: os totais somam ESTES. Duas contas sobre a
   * mesma pergunta é a porta clássica para o total dizer um número e as parcelas outro, sem que
   * nenhum dos dois pareça errado sozinho.
   */
  planoD1: PorStatus[];
  planoD2: PorStatus[];
  /**
   * LH ATRASADA — passou do meio-dia do dia da coleta e não há ninguém escalado.
   *
   * Mora no PLAN (2026-08-27, a pedido) porque é o MESMO EIXO das outras duas: pend atribuição,
   * atribuída e atrasada são os três estados da atribuição, e atrasada é literalmente "pend
   * atribuição cujo prazo venceu".
   *
   * ── A JANELA É OUTRA, E AS TRÊS FICAM COLADAS MESMO ASSIM ─────────────────────────────────
   *
   * PEND e ATRIBUÍDA contam D1+D2 — amanhã e depois. Esta não tem recorte de data: conta hoje e
   * todos os dias anteriores, de propósito, porque a viagem de ontem que ninguém atribuiu é a que
   * mais precisa aparecer.
   *
   * Cheguei a desenhar um filete separando a terceira coluna e a janela escrita em letra miúda no
   * rótulo, contra o risco de alguém ler "65 · 46 · 7" e entender que as 7 são parte das 65. O
   * usuário viu as duas versões e escolheu as três coladas (27/08).
   *
   * FICA REGISTRADO O QUE ISSO CUSTA, para quem mexer aqui depois não desfazer sem saber: as três
   * colunas NÃO são partes de um mesmo todo, e a tela não avisa. Quem opera todo dia sabe; quem
   * chega novo pode somar errado. Se a confusão aparecer na prática, o conserto é o filete — e
   * ele custa duas linhas de CSS, não um redesenho.
   *
   * A regra inteira mora em `lateToAssignSql`, que é o MESMO predicado do filtro do quadro.
   */
  atrasadas: number;
  origemRisco: number;
  origemFora: number;
  /**
   * O SPOT traz as OFERTAS inteiras, não só os nomes das rotas (2026-08-27, a pedido).
   *
   * O painel tinha um cartão "Ofertas de spot hoje" à parte com a hora, o preço e os campos da
   * oferta. Ele foi dobrado para dentro deste grupo — e dobrar teria sido perder informação se a
   * lista daqui continuasse mostrando só o nome da rota.
   */
  spot?: Pick<
    SpotDaRegiao,
    "aceito" | "naoAceito" | "esperando" | "tendenciaAceito" | "tendenciaNaoAceito" | "rotas"
  >;
}

export function CardDaFrente({ dados }: { dados: DadosDaFrente }) {
  const t = useTranslations("Trips.dashboard");

  /**
   * UMA MEDIDA ABERTA POR VEZ, e clicar de novo fecha.
   *
   * Duas listas abertas no mesmo card empilhariam códigos sem dizer de qual número vieram — e a
   * pergunta que o clique responde é "quais LH estão NESTE número", não "quais estão no card".
   */
  const [medidaAberta, setMedidaAberta] = useState<MedidaDoPainel | null>(null);
  const abrir = (m: MedidaDoPainel) => setMedidaAberta((atual) => (atual === m ? null : m));
  const { region } = dados;

  const d1 = new Map(dados.planoD1.map((s) => [s.status, s.count]));
  const d2 = new Map(dados.planoD2.map((s) => [s.status, s.count]));
  /** ATRIBUÍDA continua somada: é a coluna do que já foi resolvido, e ninguém age sobre ela. */
  const atribuida = (d1.get("assigned") ?? 0) + (d2.get("assigned") ?? 0);


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
                <Grupo cols={3} cor="bg-sky-300 dark:bg-sky-800/70">
                  {t("grupoPlan")}
                </Grupo>
                <Grupo cols={2} cor="bg-rose-300 dark:bg-rose-800/60">
                  {t("grupoOrigem")}
                </Grupo>
                {/*
                  O SPOT NÃO É COLUNA AQUI (2026-08-27, a pedido, sobre um desenho).

                  Ele saiu da tabela e virou card próprio embaixo das frentes. As outras três
                  colunas contam VIAGEM — o que foi planejado, o que atrasou, o que se espera. O
                  spot conta LEILÃO, que é outra coisa: chega por fora, tem prazo próprio e o que
                  interessa nele é o NOME DA ROTA, não a contagem.

                  Espremido em duas colunas de número, ele obrigava um clique para dizer a única
                  coisa que alguém quer saber. Embaixo, num card por frente, a rota está à vista.

                  O TOTAL SPOT continua na faixa de totais: lá a pergunta é "quantas hoje", e essa
                  a contagem responde sozinha.
                */}
                <Grupo cols={2} cor="bg-emerald-300 dark:bg-emerald-800/60">
                  {t("grupoTendencia")}
                </Grupo>
              </tr>
              <tr>
                <Medida>{t("medidaPendAtribuicao")}</Medida>
                <Medida>{t("medidaAtribuida")}</Medida>
                <Medida>{t("medidaLhAtrasada")}</Medida>
                <Medida>{t("medidaAtrasado2h")}</Medida>
                <Medida>{t("medidaForaDoPrazo")}</Medida>
                <Medida>{t("medidaAceita")}</Medida>
                <Medida>{t("medidaNaoAceita")}</Medida>
              </tr>
            </thead>
            <tbody>
              <tr>
                {/*
                  PEND ATRIBUIÇÃO SÃO DOIS NÚMEROS: D1 e D2 (30/08, a pedido — ver a foto anotada).

                  Cada metade abre a SUA lista, e não a soma das duas. Dois números que abrissem a
                  mesma lista mostrariam mais linhas do que o número clicado — o mesmo erro que o
                  comentário do `janelaDoPlano` já descreve do outro lado, e a razão de `pendD1` e
                  `pendD2` existirem como medidas próprias em vez de um recorte feito na tela.
                */}
                <ValorDuplo
                  a={d1.get("to_assign") ?? 0}
                  b={d2.get("to_assign") ?? 0}
                  rotuloA={t("d1")}
                  rotuloB={t("d2")}
                  aoClicarA={() => abrir("pendD1")}
                  aoClicarB={() => abrir("pendD2")}
                  ativoA={medidaAberta === "pendD1"}
                  ativoB={medidaAberta === "pendD2"}
                />
                <Valor
                  valor={atribuida}
                  onClick={() => abrir("atribuida")}
                  ativo={medidaAberta === "atribuida"}
                />
                <Valor
                  valor={dados.atrasadas}
                  alerta={dados.atrasadas > 0}
                  onClick={() => abrir("atrasada")}
                  ativo={medidaAberta === "atrasada"}
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
                {/*
                  TENDÊNCIA GANHOU DADO (2026-08-28). Ela mostrou travessão desde que nasceu, porque
                  travessão diz "não sei" e zero diria "não houve" — e não havia de onde tirar.

                  Agora há, e é o MESMO leilão do SPOT com outro recorte: spot é a oferta cuja viagem
                  é HOJE; tendência é a de amanhã em diante. Quem separa é a data da VIAGEM, não a
                  hora em que a oferta chegou — a mesma oferta pode chegar hoje de manhã falando de
                  uma carga de quinta. Ver `readSpotPorRegiao`.

                  Sem clique: as duas listas moram no card de spot, embaixo, onde cada linha diz o dia
                  da viagem. Abrir aqui seria um terceiro caminho para a mesma lista.
                */}
                <Valor valor={dados.spot?.tendenciaAceito ?? 0} />
                <Valor valor={dados.spot?.tendenciaNaoAceito ?? 0} />
              </tr>
            </tbody>
          </table>

          {medidaAberta ? <ListaDeLhs region={region} medida={medidaAberta} /> : null}


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
/** O andar de baixo do cabeçalho: o nome da medida. */
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
  /**
   * O número está em ALARME: há coisa atrasada.
   *
   * Ele fica vermelho E PISCA (2026-08-27, a pedido), e o piscar não é enfeite: esta tela vive
   * numa TV que ninguém toca. Um vermelho parado se confunde com qualquer outro vermelho depois
   * de meia hora na sala, e quem entrou agora não distingue "atrasou" de "está assim desde cedo".
   *
   * Pisca ENQUANTO houver o que resolver, e para sozinho quando o número volta a zero — é o
   * contrário do `.realce-aceso`, que acende uma vez quando o número muda. Ver `globals.css`.
   */
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
        // O alarme pinta o número e acende a faixa atrás dele. A faixa é o que pulsa: piscar a
        // cor da LETRA deixaria o número ilegível no vale da animação, que é o oposto do ponto.
        alerta && "text-destructive alarme-piscando",
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
 * DUAS MEDIDAS NUMA CÉLULA SÓ — o PEND ATRIBUIÇÃO repartido em D1 e D2 (30/08, a pedido).
 *
 * O desenho veio de uma foto anotada à mão: sobre o número único, o usuário escreveu "D1 | D2" com
 * o filete no meio. É isso, literalmente — a coluna continua sendo UMA no cabeçalho, e o filete é o
 * que diz que ali dentro há duas perguntas.
 *
 * ── POR QUE O RÓTULO FICA EM CIMA DE CADA NÚMERO ──────────────────────────────────────────────
 *
 * "61" sozinho já era ambíguo (amanhã? os dois dias?). "55 · 6" sem rótulo seria pior: dois números
 * sem nome convidam a somar, e a soma aqui não é o que interessa. O rótulo é minúsculo de propósito
 * — ele identifica, não compete com o número.
 *
 * ── E POR QUE NÃO SÃO DUAS COLUNAS ────────────────────────────────────────────────────────────
 *
 * Porque o cabeçalho é a planilha da operação, e mexer nele significaria a linha inteira mudar de
 * forma — sete medidas viram oito, e as outras frentes desalinham. A foto pedia dentro da célula.
 */
function ValorDuplo({
  a,
  b,
  rotuloA,
  rotuloB,
  aoClicarA,
  aoClicarB,
  ativoA,
  ativoB,
}: {
  a: number;
  b: number;
  rotuloA: string;
  rotuloB: string;
  aoClicarA: () => void;
  aoClicarB: () => void;
  ativoA?: boolean;
  ativoB?: boolean;
}) {
  const metade = (
    valor: number,
    rotulo: string,
    aoClicar: () => void,
    ativo: boolean | undefined,
  ) => (
    <button
      type="button"
      onClick={aoClicar}
      className={cn(
        "flex-1 px-1 py-1 transition-colors hover:bg-accent",
        ativo && "bg-accent",
      )}
    >
      <span className="text-muted-foreground block text-[0.5rem] font-medium uppercase leading-none tracking-wide">
        {rotulo}
      </span>
      <span
        className={cn(
          "block text-base font-semibold tabular-nums",
          // Zero apagado, como no `Valor`: um zero em tinta cheia disputa com o que importa.
          valor === 0 && "text-muted-foreground/50",
        )}
      >
        {valor}
      </span>
    </button>
  );

  return (
    <td className="border-l p-0 first:border-l-0">
      {/* O filete do meio é o `divide-x` — o mesmo traço que o usuário desenhou na foto. */}
      <div className="flex divide-x">
        {metade(a, rotuloA, aoClicarA, ativoA)}
        {metade(b, rotuloB, aoClicarB, ativoB)}
      </div>
    </td>
  );
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
/**
 * `2026-08-29` -> `29/08`.
 *
 * Corta o texto em vez de construir uma data: o valor vem do Postgres como `YYYY-MM-DD` e já é o
 * dia em São Paulo — passá-lo por `new Date` o interpretaria como UTC e a viagem da meia-noite
 * voltaria um dia. É o mesmo erro que a regra da coleta já pagou uma vez.
 */
function formatarDia(iso: string): string {
  const [, mes, dia] = iso.slice(0, 10).split("-");
  return dia && mes ? `${dia}/${mes}` : iso;
}

/** O rótulo de cada um dos três estados que a lista distingue. A cor sozinha nunca basta. */
function rotuloDoEstado(
  estado: SpotDaRegiao["rotas"][number]["estado"],
  t: (chave: string) => string,
): string {
  if (estado === "aceito") return t("medidaAceita");
  if (estado === "sem_viagem") return t("medidaNaoAceita");
  return t("spotEsperando");
}

/**
 * OS GESTOS DA LINHA — a mesma decisão do cartão do meio, no registro do dia (fatia 030).
 *
 * Componente próprio porque cada linha precisa da PRÓPRIA confirmação: com o estado no pai, confirmar
 * uma abriria a pergunta em todas.
 *
 * A confirmação em dois gestos é a mesma do cartão, e pelo mesmo motivo — o aceite não tem volta.
 */
function AcaoDaLinha({
  oferta,
  podeDecidir,
}: {
  oferta: SpotDaRegiao["rotas"][number];
  podeDecidir: boolean;
}) {
  const t = useTranslations("Spot");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(false);
  const [ignoradaAgora, setIgnoradaAgora] = useState(false);

  const aceitar = async () => {
    if (!oferta.tripId) return;
    setEnviando(true);
    try {
      await fetch(`/api/trips/${oferta.tripId}/portal-action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "accept", origem: "oferta_spot" }),
      });
      setFeito(true);
    } finally {
      setEnviando(false);
      setConfirmando(false);
    }
  };

  /**
   * IGNORAR DAQUI TIRA O CARTÃO DO MEIO, e não esta linha.
   *
   * É a diferença entre as duas telas, e ela é o FR-019: o cartão é a fila do que falta decidir, e
   * esta lista é o registro do dia. A linha continua aqui, ganha o selo "ignorado por você", e
   * continua podendo ser aceita. Ignorar não apaga a prova de que a oferta chegou.
   */
  const ignorar = async () => {
    setEnviando(true);
    try {
      await fetch(`/api/spot-offers/${oferta.ofertaId}/dispensar`, { method: "POST" });
      setIgnoradaAgora(true);
    } finally {
      setEnviando(false);
    }
  };

  // `aceito` já é final: não há gesto, e a linha só informa.
  if (oferta.estado === "aceito") return null;

  const podeMandar =
    podeDecidir && !feito && (oferta.estado === "esperando" || oferta.estado === "recusado");

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      {oferta.estado === "enviado" || feito ? (
        <span className="rounded-full bg-emerald-500/15 px-1.5 py-px text-[0.6rem] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          {t("aguardandoPortalCurto")}
        </span>
      ) : null}

      {oferta.estado === "recusado" && !feito ? (
        <span className="rounded-full bg-red-500/15 px-1.5 py-px text-[0.6rem] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">
          {t("portalRecusou")}
        </span>
      ) : null}

      {oferta.estado === "esperando" && !feito ? (
        <span className="rounded-full bg-amber-500/20 px-1.5 py-px text-[0.6rem] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
          {t("esperandoDecisao")}
        </span>
      ) : null}

      {/*
        IGNORADA CONTINUA AQUI, e é o ponto do FR-019: ignorar limpa a tela de quem clicou, não o
        registro. A linha fica, assinalada, e continua podendo ser aceita — a prova de que a oferta
        chegou não se apaga por alguém não ter querido esta.
      */}
      {/*
        QUEM IGNOROU, e não "ignorado por você" (2026-09-01).

        A dispensa passou a valer para a equipe, então o nome de quem decidiu é a informação — é ele
        que responde "por que não pegamos aquela?". O motivo vai no `title`: nem sempre existe, e
        posto na linha ocuparia espaço para dizer que não há nada a dizer.
      */}
      {oferta.ignoradaPor || ignoradaAgora ? (
        <span
          className="rounded-full bg-muted px-1.5 py-px text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground"
          title={oferta.motivoDoDescarte ?? undefined}
        >
          {t("ignoradoPor", { nome: oferta.ignoradaPor ?? "você" })}
        </span>
      ) : null}

      {podeMandar && !confirmando ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="rounded bg-emerald-600 px-2 py-px text-[0.62rem] font-bold text-white hover:bg-emerald-500"
        >
          {oferta.estado === "recusado" ? t("tentarDeNovo") : t("aceitar")}
        </button>
      ) : null}

      {/*
        IGNORAR DAQUI TIRA O CARTÃO DO MEIO, e não esta linha — ver o comentário da função.
        Some depois de clicado, porque o gesto não se repete: o selo passa a dizer o que houve.
      */}
      {podeMandar && !confirmando && !oferta.ignoradaPor && !ignoradaAgora ? (
        <button
          type="button"
          disabled={enviando}
          onClick={() => void ignorar()}
          className="rounded border px-2 py-px text-[0.62rem] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          {t("ignorar")}
        </button>
      ) : null}

      {confirmando ? (
        <span className="flex flex-wrap items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-1">
          <span className="text-[0.62rem] leading-snug">
            {t("confirmarAceiteCurto", { lh: oferta.lh ?? "" })}
          </span>
          <button
            type="button"
            disabled={enviando}
            onClick={() => void aceitar()}
            className="rounded bg-amber-400 px-2 py-px text-[0.62rem] font-bold text-amber-950 disabled:opacity-60"
          >
            {enviando ? t("enviando") : t("confirmarBotao")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="rounded border px-2 py-px text-[0.62rem] font-semibold text-muted-foreground"
          >
            {t("voltar")}
          </button>
        </span>
      ) : null}
    </span>
  );
}

function ListaDeOfertas({
  ofertas,
  podeDecidir,
}: {
  ofertas: SpotDaRegiao["rotas"];
  podeDecidir: boolean;
}) {
  const t = useTranslations("Trips.dashboard");
  const tSpot = useTranslations("Spot");

  return (
    <ul className="flex flex-col gap-1.5">
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
                O ponto diz em que pé está, e a cor sozinha não bastaria: quem não distingue verde
                de cinza precisa do título.

                O TERCEIRO ESTADO entrou em 2026-09-01 (fatia 030). Eram dois — pegamos ou não —, e
                a oferta que ESPERA decisão não cabia em nenhum: ela era contada como pega, porque a
                conta antiga perguntava só se a viagem existia no TMS. O âmbar pulsando é o que
                separa "estamos decidindo" de "decidido", e é a única linha em que há o que fazer.
              */}
              <span
                className={cn(
                  "mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                  o.estado === "aceito"
                    ? "bg-emerald-500"
                    : o.estado === "sem_viagem"
                      ? "bg-muted-foreground/40"
                      : "animate-pulse bg-amber-500 ring-2 ring-amber-500/30",
                )}
                title={rotuloDoEstado(o.estado, t)}
                aria-label={rotuloDoEstado(o.estado, t)}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  {/*
                    O DIA DA VIAGEM, e só nas de tendência (2026-08-28).

                    Sem ele o card lista hoje e amanhã embaralhados, e o número da coluna TENDÊNCIA
                    fica sem como ser conferido: alguém lê "2" em cima e vê quatro linhas embaixo,
                    sem nada dizendo quais duas são.

                    Só nas de tendência porque o card já é do dia: escrever a data de hoje em toda
                    linha seria repetir o óbvio para marcar a exceção.
                  */}
                  {o.tendencia && o.diaDaViagem ? (
                    <span
                      className="shrink-0 rounded bg-emerald-200 px-1 text-[0.6rem] font-semibold tabular-nums text-emerald-950 dark:bg-emerald-800/60 dark:text-emerald-50"
                      title={t("grupoTendencia")}
                    >
                      {formatarDia(o.diaDaViagem)}
                    </span>
                  ) : null}
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
                {/*
                  A AÇÃO NA LINHA (2026-09-01, fatia 030) — e é a MESMA decisão do cartão do meio.

                  Quem recolheu os cartões, ou entrou depois, encontra aqui o que ficou esperando. As
                  duas telas leem a mesma derivação e chamam a mesma rota, então aceitar de um lado
                  aparece no outro sem ação nenhuma.
                */}
                <AcaoDaLinha oferta={o} podeDecidir={podeDecidir} />
              </span>
            </li>
          );
        })}
    </ul>
  );
}

/**
 * OS CARDS DE SPOT, EMBAIXO DAS FRENTES (2026-08-27, a pedido, sobre um desenho).
 *
 * O spot era um grupo de duas colunas dentro do card da frente, e o clique nele abria as rotas.
 * Saiu de lá e virou UM CARD POR FRENTE, numa faixa própria embaixo do quadro.
 *
 * ── POR QUE ELE NÃO ERA COLUNA ────────────────────────────────────────────────────────────────
 *
 * As outras três colunas contam VIAGEM: o que foi planejado, o que atrasou, o que se espera. Elas
 * respondem com número, e o número basta — "31 pendentes" é uma informação completa.
 *
 * O spot conta LEILÃO, e não se comporta assim. Chega por fora, tem prazo curto e o que decide é o
 * NOME DA ROTA: "4 aceitas" não diz se a frente pegou as quatro que importavam ou quatro que
 * ninguém queria. Espremido em duas colunas de número, ele escondia atrás de um clique a única
 * coisa que alguém quer saber. Aqui a rota está à vista.
 *
 * ── E POR QUE UM CARD POR FRENTE, E NÃO UM SÓ COM TUDO ────────────────────────────────────────
 *
 * Era assim que o cartão antigo fazia — uma lista do dia inteiro, misturando as três frentes — e
 * para saber de quem era cada oferta era preciso ler o nome da estação dentro da rota. Lado a lado,
 * cada frente responde por si e a comparação entre elas se faz de relance.
 *
 * ── O TOTAL SPOT FICA ONDE ESTAVA ─────────────────────────────────────────────────────────────
 *
 * Na faixa de totais, em cima. Lá a pergunta é "quantas hoje", e essa a contagem responde sozinha.
 *
 * ── A FRENTE SEM OFERTA GANHA CARD MESMO ASSIM (2026-08-28, a pedido) ─────────────────────────
 *
 * Aqui a frente sem oferta era ESCONDIDA, e a faixa inteira sumia nos dias sem nenhuma. O
 * argumento era que leilão é evento e não fluxo, e três caixas vazias ocupariam um terço da tela
 * para dizer que não houve nada.
 *
 * O argumento estava errado por um motivo que só apareceu na tela: CARD SUMIDO É INDISTINGUÍVEL
 * DE CARD QUEBRADO. O Sudeste passou um dia sem oferta, o card sumiu, e não havia como saber se
 * era silêncio do leilão ou defeito da tela — que é a pergunta errada para alguém fazer olhando
 * um painel de parede.
 *
 * Agora as três frentes estão sempre lá, e a que não teve oferta DIZ que não teve. O silêncio
 * vira informação em vez de ausência. O custo é a altura fixa da faixa, que é barato perto de
 * alguém desconfiar do painel inteiro.
 */
export function CardsDeSpot({
  frentes,
  podeDecidir,
}: {
  frentes: DadosDaFrente[];
  podeDecidir: boolean;
}) {
  const t = useTranslations("Trips.dashboard");
  if (frentes.length === 0) return null;

  return (
    <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
      {frentes.map((f) => (
        <Card key={f.region ?? "__sem_regiao__"} className="overflow-hidden p-0">
          {/*
            O cabeçalho é a faixa âmbar do grupo que saiu da tabela: é a mesma informação, e a cor
            é como quem já conhece o quadro reconhece que este card é a coluna SPOT.
          */}
          <div className="flex items-baseline justify-between gap-2 bg-amber-300 px-3 py-1.5 dark:bg-amber-800/60">
            <span className="text-[0.68rem] font-bold uppercase tracking-wider">
              {t("grupoSpot")} · {f.region ?? t("regionUnassigned")}
            </span>
            {/*
              As duas contagens que eram as colunas Aceita / N Aceita. Aqui elas cabem no cabeçalho
              porque o corpo do card já é a lista — o número deixou de ser o conteúdo e virou resumo.
            */}
            {/*
              O RESUMO CONTA OS DOIS RECORTES, não aceitas contra não-aceitas.

              Ele dizia "2 aceitas · 1 não". Com a tendência separada, esse par deixou de amarrar o
              card a coluna nenhuma: a lista traz hoje E amanhã juntas, e o número do cabeçalho não
              batia com o SPOT nem com a TENDÊNCIA.

              Agora ele diz de onde vem cada linha — e é exatamente a leitura das duas colunas da
              tabela acima. Quem pegou e quem não pegou continua dito, linha a linha, pelo ponto.
            */}
            {/*
              "N ESPERANDO" ENTROU EM 2026-09-01 (fatia 030), e é a única parte deste resumo sobre
              a qual há o que FAZER. Sem ela, quem passa os olhos no painel não distingue a frente
              onde tudo já foi decidido daquela com três ofertas paradas esperando alguém.

              O total de hoje passou a somar TRÊS contas, e não duas: aceita, não aceita e esperando.
              Antes eram duas porque a oferta que esperava era contada como aceita — ver o comentário
              da consulta em `readSpotPorRegiao`.
            */}
            <span className="shrink-0 text-[0.68rem] font-semibold tabular-nums">
              {t("spotResumo", {
                hoje:
                  (f.spot?.aceito ?? 0) + (f.spot?.naoAceito ?? 0) + (f.spot?.esperando ?? 0),
                tendencia: (f.spot?.tendenciaAceito ?? 0) + (f.spot?.tendenciaNaoAceito ?? 0),
              })}
              {(f.spot?.esperando ?? 0) > 0 ? (
                <span className="ml-1.5 rounded-full bg-amber-500/25 px-1.5 py-px text-amber-900 dark:text-amber-200">
                  {t("spotEsperandoResumo", { n: f.spot?.esperando ?? 0 })}
                </span>
              ) : null}
            </span>
          </div>

          {/*
            ALTURA COM TETO E ROLAGEM PRÓPRIA. Vinte ofertas numa frente movimentada empurrariam o
            resto da tela para baixo, e este card fica no PÉ do painel: o que ele empurra é o que
            ninguém mais vê. Com o teto, a faixa das três frentes mantém a mesma altura.
          */}
          <div className="max-h-52 overflow-y-auto px-3 py-2">
            {(f.spot?.rotas.length ?? 0) === 0 ? (
              /*
                A FRASE, e não uma lista vazia. Sem ela o card ficaria com um retângulo branco
                embaixo do cabeçalho, que lê como "carregando" ou "quebrou" — exatamente a dúvida
                que trazer o card de volta veio desfazer.
              */
              <p className="py-1 text-[0.7rem] text-muted-foreground">{t("spotSemOferta")}</p>
            ) : (
              <ListaDeOfertas ofertas={f.spot?.rotas ?? []} podeDecidir={podeDecidir} />
            )}
          </div>
        </Card>
      ))}
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
  // Soma os DOIS dias — os totais somam as parcelas que os cards mostram, nunca um terceiro cálculo.
  const doPlano = (d: DadosDaFrente) =>
    [...d.planoD1, ...d.planoD2].reduce((n, s) => n + s.count, 0);

  const totais = [
    { chave: "totalPlan", valor: soma(doPlano), cor: "bg-sky-300 dark:bg-sky-800/70" },
    /*
     * O TOTAL ATRASADA é coluna própria, e não entra no total do PLAN.
     *
     * Somá-lo ao total de pend + atribuída daria um número que não quer dizer nada: são janelas
     * diferentes, e a mesma viagem poderia ser contada duas vezes se atrasasse dentro do horizonte.
     * Aqui, como no card, ela fica ao lado — mesma cor de grupo, coluna separada.
     */
    {
      chave: "totalAtrasada",
      valor: soma((d) => d.atrasadas),
      cor: "bg-sky-300 dark:bg-sky-800/70",
      alerta: true,
    },
    {
      chave: "totalOrigem",
      valor: soma((d) => d.origemRisco + d.origemFora),
      cor: "bg-rose-300 dark:bg-rose-800/60",
      alerta: true,
    },
    {
      chave: "totalSpot",
      valor: soma((d) => (d.spot?.aceito ?? 0) + (d.spot?.naoAceito ?? 0)),
      cor: "bg-amber-300 dark:bg-amber-800/60",
    },
    {
      chave: "totalTendencia",
      valor: soma((d) => (d.spot?.tendenciaAceito ?? 0) + (d.spot?.tendenciaNaoAceito ?? 0)),
      cor: "bg-emerald-300 dark:bg-emerald-800/60",
    },
  ];

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-2 lg:grid-cols-5">
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
                // O alarme pisca aqui pela mesma razão que pisca no card: numa TV, vermelho
                // parado vira paisagem em meia hora. A faixa é inline para não pegar a largura
                // inteira da coluna — o alarme é do número, não da célula.
                x.alerta && (x.valor ?? 0) > 0 && "text-destructive",
              )}
            >
              <span className={cn(x.alerta && (x.valor ?? 0) > 0 && "alarme-piscando px-2")}>
                {x.valor === null ? "—" : x.valor}
              </span>
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
