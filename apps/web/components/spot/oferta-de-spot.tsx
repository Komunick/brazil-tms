"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Gavel } from "lucide-react";
import type { SpotOfferView } from "@brazil-tms/db";
import { useSpotOffers } from "@/lib/trips/client";
import { estadoInicial, novasOfertas } from "@/lib/spot/ofertas";
import { tocarAviso } from "@/lib/spot/som";
import { avisarNoSistema } from "@/lib/spot/aviso-do-sistema";
import { EVENTO_ENSAIO } from "@/lib/spot/ensaio";
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

  if (recolhido) {
    return (
      <div className="pointer-events-none fixed inset-0 z-50">
        <button
          type="button"
          onClick={() => setRecolhido(false)}
          className="pointer-events-auto absolute bottom-5 right-5 flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-bold shadow-[0_12px_28px_-14px_rgba(0,0,0,0.8)]"
          style={{
            background: "linear-gradient(160deg, #12283F, #0C1A2B)",
            outline: "3px solid #1B7A3D",
            color: "#EEF3F8",
          }}
        >
          <Gavel className="h-4 w-4" style={{ color: "#F2C230" }} aria-hidden />
          <span
            className="rounded-full px-2 font-extrabold tabular-nums"
            style={{ background: "#F2C230", color: "#2A1F00" }}
          >
            {naTela.length}
          </span>
          {t("esperandoDecisao")}
        </button>
      </div>
    );
  }

  const compacto = naTela.length > 1;

  return (
    /*
      A CAMADA É TRANSPARENTE AO MOUSE. Só os cartões recebem clique, e não há fundo nenhum pintado
      atrás deles — quem está atribuindo continua lendo, clicando e digitando no que está embaixo.
      É o FR-003, e há um Playwright que o prova preenchendo um campo com cartões na tela.
    */
    <div
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex max-h-full w-full max-w-[960px] flex-col gap-3 overflow-y-auto">
        {/* A barra só aparece com mais de um: com um cartão só ela seria enfeite. */}
        {naTela.length > 1 ? (
          <div
            className="pointer-events-auto flex shrink-0 items-center justify-between gap-3 rounded-xl border px-3 py-1.5 text-xs font-semibold"
            style={{
              background: "rgba(12,26,43,0.92)",
              borderColor: "rgba(238,243,248,0.16)",
              color: "#EEF3F8",
            }}
          >
            <span className="flex items-center gap-2 tracking-wide">
              <span
                className="rounded-full px-2 font-extrabold tabular-nums"
                style={{ background: "#F2C230", color: "#2A1F00" }}
              >
                {naTela.length}
              </span>
              {t("esperandoDecisao")}
            </span>
            <button
              type="button"
              onClick={() => setRecolhido(true)}
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1"
              style={{ borderColor: "rgba(238,243,248,0.28)", color: "#93A9BF" }}
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              {t("recolher")}
            </button>
          </div>
        ) : null}

        {/*
          UM cartão ocupa o meio como antes; DOIS ou mais dividem em duas colunas e descem em linhas.
          Passando da altura, o conjunto rola dentro da própria camada — sem esconder nenhum, que é
          o que a fila antiga fazia.
        */}
        <div className={`grid gap-3 ${compacto ? "sm:grid-cols-2" : "grid-cols-1"}`}>
          {naTela.map((oferta) => (
            <CartaoDaOferta
              key={oferta.id}
              oferta={oferta}
              /*
                Sem `tripId` não há a quem endereçar a ordem, e o próprio cartão diz isso. A
                autoridade continua sendo o servidor: `podeAceitar` só decide o que o botão mostra.
              */
              podeDecidir={podeDecidir}
              enviando={enviando === oferta.id}
              onAceitar={() => void aceitar(oferta)}
              onIgnorar={(motivo) => void ignorar(oferta, motivo)}
              compacto={compacto}
            />
          ))}
        </div>

        {/* Um cartão sozinho também precisa poder sair da frente. */}
        {naTela.length === 1 ? (
          <button
            type="button"
            onClick={() => setRecolhido(true)}
            className="pointer-events-auto mx-auto flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
            style={{
              background: "rgba(12,26,43,0.92)",
              borderColor: "rgba(238,243,248,0.24)",
              color: "#93A9BF",
            }}
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            {t("recolher")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
