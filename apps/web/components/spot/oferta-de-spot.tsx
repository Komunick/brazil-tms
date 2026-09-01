"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SpotOfferView } from "@brazil-tms/db";
import { useSpotOffers } from "@/lib/trips/client";
import { estadoInicial, novasOfertas } from "@/lib/spot/ofertas";
import { tocarAviso } from "@/lib/spot/som";
import { avisarNoSistema } from "@/lib/spot/aviso-do-sistema";
import { EVENTO_ENSAIO } from "@/lib/spot/ensaio";
import { useEsteira } from "@/lib/spot/esteira";
import { CartaoDaOferta } from "./cartao-da-oferta";

/**
 * AS OFERTAS DE SPOT NA TELA — e agora elas FICAM (2026-09-01, a pedido).
 *
 * O leilão de spot tem prazo curto: quem vê primeiro dá lance. Este aviso existia desde 2026-08-18
 * como um cartão que subia no meio da tela e saía sozinho em trinta segundos. Ele avisava, e era só
 * o que dava para fazer com ele — quem quisesse pegar o frete tinha de sair dali, abrir a lista de
 * viagens, procurar o número da LH e aceitar por lá.
 *
 * Medido em produção em 01/09: **onze aceites de LH vinda de oferta de spot foram disparados de zero
 * a três minutos depois de a oferta chegar** — exatamente a janela em que este cartão estava na tela.
 * A operação já fazia este caminho à mão, todo dia. O que faltava era o botão onde a decisão já
 * estava sendo tomada.
 *
 * ── AS TRÊS COISAS QUE SE INVERTERAM, e o porquê de cada uma ─────────────────────────────────
 *
 * O CARTÃO NÃO SAI MAIS SOZINHO. O comentário antigo defendia o contrário, e a defesa era boa para o
 * que ele era: "aviso que depende de clique vira cortina permanente no primeiro dia em que a sala
 * esvazia". O que mudou não foi a lógica — foi o cartão deixar de ser só aviso. Um aviso que some é
 * aceitável; uma DECISÃO que some sem ser tomada é a oferta passando batido, que é o defeito que
 * esta fatia veio consertar. Perguntei ao usuário se a TV deveria ser exceção na madrugada, e a
 * resposta foi que há gente trabalhando de madrugada e que se aceita de madrugada. Nenhuma exceção.
 *
 * A CORTINA SAIU. Havia aqui um `boxShadow: 0 0 0 9999px rgba(3,10,18,0.62)`, que escurecia a tela
 * inteira por trás do cartão. Com trinta segundos, era ênfase; com o cartão parado, seria o TMS
 * apagado o dia inteiro — e o pedido foi explícito: "que não atrapalhe se alguém tiver atribuindo".
 * A camada continua transparente ao mouse, e só os cartões recebem clique.
 *
 * TODOS AO MESMO TEMPO, e não um de cada vez. A fila existia porque três ofertas empilhadas
 * esconderiam duas. Agora elas dividem o espaço — lado a lado e em linhas —, que foi o pedido:
 * "um do lado do outro, um embaixo do outro".
 *
 * ── O QUE NÃO MUDOU, e não pode mudar ────────────────────────────────────────────────────────
 *
 * O SOM. `estadoInicial`/`novasOfertas` continuam sendo a memória de "já apitei por esta oferta", e
 * SÓ disso. Elas não são, e não podem virar, a memória da decisão: essa vive no banco, porque
 * recarregar a página não pode trazer de volta o que alguém já resolveu — nem apitar de novo por
 * quem já está na tela.
 *
 * O QUE TIRA O CARTÃO DE TODAS AS TELAS. Não existe aqui um caminho de código que remova um cartão
 * por aceite. A oferta some porque a leitura seguinte não a traz — o servidor a exclui quando o
 * portal diz `Accepted`. Não havendo o ramo, não há um segundo motivo capaz de entrar nele, e é
 * assim que o "só some quando o portal confirmar" fica garantido por construção.
 */
/** As duas cores que a camada usa. O resto do laranja mora no cartão. */
const LARANJA = "#EE4D2D";
const LARANJA_ESCURO = "#D73211";

export function OfertaDeSpot({ podeDecidir }: { podeDecidir: boolean }) {
  const t = useTranslations("Spot");
  const { data, refetch } = useSpotOffers();
  const ofertas = useMemo(() => data?.ofertas ?? [], [data?.ofertas]);

  /**
   * A memória do APITO, e só dela. Vive num `useRef` porque é memória de sessão da tela: recriá-la a
   * cada render faria a mesma oferta voltar a ser novidade e apitar sem parar. Ver `novasOfertas`.
   */
  const memoria = useRef(estadoInicial());
  const ensaiada = useRef<string | null>(null);

  /** As ofertas de ensaio vivem só aqui: elas não estão na resposta do servidor. */
  const [ensaios, setEnsaios] = useState<SpotOfferView[]>([]);
  const [recolhido, setRecolhido] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [saindo, setSaindo] = useState<Set<string>>(new Set());
  /**
   * QUANTOS CARTÕES ESTÃO COM UMA PERGUNTA ABERTA — e por que a esteira precisa saber.
   *
   * O mouse em cima já pausa a faixa. Mas quem aperta Aceitar e AFASTA o mouse para ler a pergunta
   * veria o cartão deslizar embaixo dela, levando a confirmação junto. É um caso real e o contador
   * é o menor jeito de cobri-lo: o cartão avisa quando abre e quando fecha, e a esteira só anda com
   * ele em zero.
   */
  const [ocupados, setOcupados] = useState(0);
  const { ref: esteira, pausar, soltar } = useEsteira(ocupados > 0);

  const naTela = useMemo(
    () => [...ensaios, ...ofertas].filter((o) => !saindo.has(o.id)),
    [ensaios, ofertas, saindo],
  );

  /**
   * O APITO E O AVISO DO SISTEMA saem quando uma oferta é NOVIDADE, e uma vez só por oferta.
   *
   * Antes isto acontecia quando o cartão SUBIA, porque só um subia por vez. Com todos na tela, subir
   * e chegar viraram a mesma coisa — e a guarda de `novasOfertas` continua sendo o que impede o
   * cartão parado de apitar a cada ciclo de cinco segundos.
   */
  useEffect(() => {
    if (!data?.ofertas) return;
    const novas = novasOfertas(memoria.current, data.ofertas);
    for (const nova of novas) {
      tocarAviso();
      avisarNoSistema(
        t("systemTitle"),
        [nova.route, nova.price].filter(Boolean).join(" · "),
        { somenteSeEscondido: ensaiada.current !== nova.id },
      );
    }
    /*
      UMA OFERTA NOVA REABRE O CONJUNTO (2026-09-01). Recolher é "me dá a tela por um minuto", não
      uma preferência — e informação nova não pode ficar atrás de um gesto antigo. O custo é
      conhecido: quem recolheu para atribuir pode ser reaberto no meio. É por isso que a camada não
      rouba foco nem bloqueia clique — reabrir é um incômodo visual, não uma interrupção.
    */
    if (novas.length > 0) setRecolhido(false);
  }, [data?.ofertas, t]);

  /**
   * O ENSAIO — o mesmo cartão, o mesmo som, com uma oferta de mentira.
   *
   * Ele entra pela porta da frente de propósito: a MESMA lista da oferta de verdade. Um ensaio que
   * desenhasse o cartão por outro caminho provaria que o outro caminho funciona.
   *
   * Não passa por `novasOfertas` na chegada: a oferta de ensaio não está na resposta do servidor, e
   * registrá-la na memória de vistos faria a próxima oferta REAL com aquele id ser tratada como já
   * anunciada.
   */
  useEffect(() => {
    const aoEnsaiar = (e: Event) => {
      const oferta = (e as CustomEvent<SpotOfferView>).detail;
      if (!oferta) return;
      ensaiada.current = oferta.id;
      setEnsaios((atuais) => [oferta, ...atuais.filter((o) => o.id !== oferta.id)]);
      setRecolhido(false);
      tocarAviso();
      avisarNoSistema(t("systemTitle"), [oferta.route, oferta.price].filter(Boolean).join(" · "), {
        somenteSeEscondido: false,
      });
    };
    window.addEventListener(EVENTO_ENSAIO, aoEnsaiar);
    return () => window.removeEventListener(EVENTO_ENSAIO, aoEnsaiar);
  }, [t]);

  /**
   * IGNORAR — grava a dispensa e tira o cartão da MINHA tela.
   *
   * O `saindo` é o que faz o cartão sumir na hora, antes de a leitura seguinte confirmar. Sem ele, o
   * cartão ficaria até cinco segundos na tela depois do clique, e a pessoa clicaria de novo.
   *
   * A oferta de ensaio não vai ao servidor: ela nunca existiu lá.
   */
  const ignorar = useCallback(
    async (oferta: SpotOfferView, motivo: string | null) => {
      setSaindo((s) => new Set(s).add(oferta.id));
      if (oferta.id.startsWith("ensaio-")) {
        setEnsaios((atuais) => atuais.filter((o) => o.id !== oferta.id));
        return;
      }
      try {
        await fetch(`/api/spot-offers/${oferta.id}/dispensar`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ motivo }),
        });
      } catch {
        // Falhou: o cartão volta, porque o servidor não gravou e a leitura seguinte o trará.
        setSaindo((s) => {
          const novo = new Set(s);
          novo.delete(oferta.id);
          return novo;
        });
      }
    },
    [],
  );

  /**
   * ACEITAR — a MESMA ordem que a tela de viagem grava, pelo MESMO caminho.
   *
   * `origem` vai para a auditoria dizer que a decisão saiu daqui, e não da tela da viagem: são dois
   * atos diferentes, um no calor do leilão e outro com a lista à vista.
   *
   * O CARTÃO NÃO SAI AQUI, e é o ponto: 202 quer dizer ACEITO, não FEITO. Ele passa a `enviado` na
   * leitura seguinte e só some quando o portal confirmar. Medido: 4 das 17 ordens de aceite já
   * gravadas voltaram RECUSADAS pelo portal.
   */
  const aceitar = useCallback(
    async (oferta: SpotOfferView) => {
      if (!oferta.tripId) return;
      setEnviando(oferta.id);
      try {
        await fetch(`/api/trips/${oferta.tripId}/portal-action`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "accept", origem: "oferta_spot" }),
        });
      } finally {
        setEnviando(null);
        // Puxa já, para o cartão passar a "enviado" sem esperar o ciclo de cinco segundos.
        void refetch();
      }
    },
    [refetch],
  );

  if (naTela.length === 0) return null;

  /*
    ── RECOLHIDO: UM PAINEL NA DIREITA, e não um botão solto (2026-09-01, a pedido) ─────────────

    Recolher era um comprimido no canto que só dizia "3 esperando". Escondia demais: quem recolheu
    para atribuir perdia de vista QUAIS ofertas estavam paradas, e voltava a abrir tudo só para
    lembrar. O painel mantém a lista à mão — LH, rota e horário — e ainda deixa decidir dali.

    Ele fica na direita, encostado, ocupando uma faixa estreita. É o desenho que o usuário aprovou:
    a esteira sai do caminho, e a informação não sai junto.
  */
  if (recolhido) {
    return (
      <div className="pointer-events-none fixed inset-0 z-50">
        <aside
          className="pointer-events-auto absolute bottom-4 right-4 top-4 flex w-[300px] flex-col overflow-hidden rounded-2xl border-2 bg-card shadow-[0_20px_44px_-16px_rgba(0,0,0,0.5)]"
          style={{ borderColor: LARANJA }}
          role="status"
          aria-live="polite"
        >
          <div
            className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-xs font-extrabold text-white"
            style={{ background: LARANJA }}
          >
            <span className="flex items-center gap-2">
              <span
                className="rounded-full bg-white px-2 font-black tabular-nums"
                style={{ color: LARANJA_ESCURO }}
              >
                {naTela.length}
              </span>
              {t("esperandoDecisao")}
            </span>
            <button
              type="button"
              onClick={() => setRecolhido(false)}
              className="flex items-center gap-1 rounded-md border border-white/60 bg-white/20 px-2 py-0.5 font-bold hover:bg-white/30"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              {t("abrir")}
            </button>
          </div>

          <div className="flex flex-col gap-2 overflow-y-auto p-2.5">
            {naTela.map((oferta) => (
              <ItemRecolhido
                key={oferta.id}
                oferta={oferta}
                podeDecidir={podeDecidir}
                /*
                  Decidir daqui ABRE a esteira antes de perguntar. A confirmação de dois gestos e o
                  campo de motivo vivem no cartão inteiro, e reproduzi-los aqui seria uma segunda
                  cópia dos mesmos dois gestos — que divergiriam no primeiro ajuste.
                */
                aoDecidir={() => setRecolhido(false)}
              />
            ))}
          </div>
        </aside>
      </div>
    );
  }

  /*
    OS CARTÕES FICAM GRANDES, sempre (2026-09-01, correção a pedido).

    A esteira nasceu no rodapé e com o cartão encolhido a partir do segundo — a ideia era caber mais
    de um na vista. Estava errado, e o usuário corrigiu: o pedido sempre foi o cartão GRANDE, NO MEIO
    da tela. Encolher para caber mais é resolver o problema errado; quem decide um leilão lê UMA
    oferta de cada vez, e a esteira já existe justamente para as outras não sumirem.
  */
  const compacto = false;

  return (
    /*
      ── A ESTEIRA, NO MEIO DA TELA e na horizontal (2026-09-01, a pedido) ────────────────────────

      Os cartões acumulam para a DIREITA em vez de dividirem o espaço entre si. Quando não cabem, a
      faixa anda sozinha — ver `useEsteira`.

      ELA FICA NO MEIO, e não no rodapé. A primeira versão a pôs embaixo, para ocupar menos; o
      usuário corrigiu, e a razão é a mesma do cartão grande — este aviso precisa que alguém VIRE A
      CABEÇA, e rodapé é onde mora o que não pede atenção.

      A CAMADA CONTINUA TRANSPARENTE AO MOUSE: só os cartões recebem clique, e não há fundo pintado
      atrás deles. Quem está atribuindo continua lendo, clicando e digitando no que está embaixo.
      É o FR-003, e há um Playwright que o prova preenchendo um campo com cartões na tela.
    */
    <div
      className="pointer-events-none fixed inset-0 z-50 flex flex-col justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto mx-4 mb-2 flex items-center justify-between gap-3">
        <span
          className="flex items-center gap-2 rounded-full py-1 pl-1.5 pr-3 text-xs font-extrabold text-white"
          style={{ background: LARANJA }}
        >
          <span
            className="rounded-full bg-white px-2 font-black tabular-nums"
            style={{ color: LARANJA_ESCURO }}
          >
            {naTela.length}
          </span>
          {t("esperandoDecisao")}
        </span>

        <button
          type="button"
          onClick={() => setRecolhido(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold text-white shadow-[0_3px_10px_-3px_rgba(238,77,45,0.7)]"
          style={{ background: LARANJA }}
        >
          {t("recolher")}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div
        ref={esteira}
        onMouseEnter={pausar}
        onMouseLeave={soltar}
        onFocusCapture={pausar}
        onBlurCapture={soltar}
        className="pointer-events-auto flex gap-3 overflow-x-auto px-4 pb-1.5 pt-1"
      >
        {/*
          560 px por cartão — o inteiro, e não o encolhido.

          Numa tela de 1920 cabem três; numa de 1366, dois. É de propósito: quem decide um leilão lê
          UMA oferta de cada vez, e as outras não somem — a esteira anda até elas.
        */}
        {naTela.map((oferta) => (
          <div key={oferta.id} className="w-[560px] shrink-0">
            <CartaoDaOferta
              oferta={oferta}
              podeDecidir={podeDecidir}
              enviando={enviando === oferta.id}
              onAceitar={() => void aceitar(oferta)}
              onIgnorar={(motivo) => void ignorar(oferta, motivo)}
              aoOcuparse={(ocupado) => setOcupados((n) => Math.max(0, n + (ocupado ? 1 : -1)))}
              /*
                COMPACTO SÓ QUANDO ANDA. Com um ou dois cartões a esteira está parada e cabe tudo;
                a partir daí ela se move, e o cartão menor é o que faz mais de um caber na vista de
                uma vez — quem decide precisa comparar duas ofertas, não ler uma de cada vez.
              */
              compacto={compacto}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * UMA LINHA DO PAINEL RECOLHIDO — o suficiente para reconhecer a oferta e decidir voltar a ela.
 *
 * Traz LH, rota e o STA. Não traz os botões de decisão de verdade: a confirmação de dois gestos e o
 * campo de motivo vivem no cartão, e reproduzi-los aqui criaria uma segunda cópia dos mesmos dois
 * gestos. Quem quer decidir abre — é um clique, e o clique já estava lá.
 */
function ItemRecolhido({
  oferta,
  podeDecidir,
  aoDecidir,
}: {
  oferta: SpotOfferView;
  podeDecidir: boolean;
  aoDecidir: () => void;
}) {
  const t = useTranslations("Spot");
  const enviado = oferta.estado === "enviado";

  return (
    <div
      className="flex flex-col gap-1 rounded-xl border border-l-4 p-2.5"
      style={{ borderLeftColor: enviado ? "#12925A" : LARANJA }}
    >
      <span
        className="text-[0.72rem] font-black tracking-[0.06em] tabular-nums"
        style={{ color: LARANJA_ESCURO }}
      >
        {oferta.tripNumber}
      </span>
      <span className="text-[0.72rem] font-semibold leading-snug">{oferta.route}</span>
      {oferta.originArrival ? (
        <span className="text-[0.64rem] text-muted-foreground">
          {t("originArrival")} {oferta.originArrival}
          {oferta.vehicle ? ` · ${oferta.vehicle}` : ""}
        </span>
      ) : null}

      {enviado ? (
        <span className="text-[0.64rem] font-extrabold text-success">
          {oferta.decidiuNome ? t("aceitoPor", { nome: oferta.decidiuNome }) : t("esperandoDecisao")}
        </span>
      ) : podeDecidir ? (
        <button
          type="button"
          onClick={aoDecidir}
          className="mt-0.5 self-start rounded px-2 py-0.5 text-[0.66rem] font-extrabold text-white"
          style={{ background: LARANJA }}
        >
          {t("decidir")}
        </button>
      ) : null}
    </div>
  );
}
