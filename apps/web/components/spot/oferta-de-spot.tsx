"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Gavel, X } from "lucide-react";
import type { SpotOfferView } from "@brazil-tms/db";
import { useSpotOffers } from "@/lib/trips/client";
import { estadoInicial, novasOfertas } from "@/lib/spot/ofertas";
import { tocarAviso } from "@/lib/spot/som";

/**
 * O AVISO DE OFERTA no meio da tela (2026-08-18).
 *
 * O leilão de spot tem prazo curto: quem vê primeiro dá lance. O aviso já existia no Telegram, no
 * celular de quem estava olhando; este é o mesmo aviso na tela de quem está trabalhando.
 *
 * Três decisões vêm de a tela ficar ligada o dia inteiro, às vezes sem ninguém tocando nela:
 *
 *   MÉDIO, NÃO TELA CHEIA. Cobre o centro e deixa o painel respirando em volta. Uma cortina cheia
 *   faria a sala pedir para desligar o aviso, e aí ele não avisa mais nada.
 *
 *   SAI SOZINHO EM 30 SEGUNDOS. O botão de fechar é atalho para quem está na frente do computador,
 *   não condição: numa TV ninguém clica, e aviso que depende de clique vira cortina permanente no
 *   primeiro dia em que a sala esvazia.
 *
 *   UM DE CADA VEZ, EM FILA. Chegando três no mesmo ciclo, empilhá-las esconderia duas.
 */

/** Quanto tempo cada aviso fica na tela. */
const DURACAO_MS = 30_000;

export function OfertaDeSpot() {
  const t = useTranslations("Spot");
  // Busca própria, com ritmo próprio: o componente é montado em telas de cadências diferentes e não
  // pode herdar a lentidão de nenhuma delas. Ver `useSpotOffers`.
  const { data } = useSpotOffers();
  const ofertas = data?.ofertas;

  // A memória de "já anunciei" vive na sessão da tela, não em estado do React: recriá-la a cada
  // render faria a mesma oferta voltar a ser novidade. Ver `novasOfertas`.
  const memoria = useRef(estadoInicial());
  const [fila, setFila] = useState<SpotOfferView[]>([]);
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    if (!ofertas) return;
    const novas = novasOfertas(memoria.current, ofertas);
    if (novas.length === 0) return;
    setFila((atual) => [...atual, ...novas]);
    tocarAviso();
  }, [ofertas]);

  const atual = fila[0];

  /**
   * A saída passa pela animação antes de tirar da fila.
   *
   * Sem isso, fechar (ou o tempo acabar) faz o cartão SUMIR num quadro — e some junto a informação
   * de que ele estava ali, o que numa tela de canto do olho parece falha de renderização.
   */
  const encerrar = useCallback(() => {
    setSaindo(true);
    setTimeout(() => {
      setSaindo(false);
      setFila((f) => f.slice(1));
    }, 220);
  }, []);

  useEffect(() => {
    if (!atual) return;
    const t = setTimeout(encerrar, DURACAO_MS);
    return () => clearTimeout(t);
  }, [atual, encerrar]);

  if (!atual) return null;

  return (
    <div
      // A CAMADA é transparente ao mouse; só o cartão recebe clique. Assim o botão de fechar funciona
      // sem que o resto do aviso roube um clique de quem está trabalhando no painel atrás.
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4"
      role="status"
      aria-live="polite"
    >
      {/**
       * QUADRADO, e com QUATRO informações (2026-08-19, a pedido, sobre um desenho do usuário).
       *
       * Era um retângulo largo com cabeçalho, preço em destaque e contador de fila. Virou um quadrado
       * com viagem, rota, saída e veículo — as mesmas coisas que vão para o Telegram, e só elas.
       *
       * O que saiu, e por quê: o PREÇO, porque a maioria das ofertas chega como "preço não exibido" e
       * um campo que quase sempre diz nada rouba o lugar do que decide; o CABEÇALHO "Nova oferta",
       * porque um aviso que ocupa o meio da tela por trinta segundos já se anuncia sozinho; e o
       * CONTADOR DE FILA, porque a segunda oferta aparece logo em seguida de qualquer jeito.
       *
       * O que ficou, e não é informação: o X (foi pedido antes) e a barra de tempo, que é o que
       * explica por que o aviso some sozinho.
       *
       * `aspect-square` com largura em `vw` mantém o quadrado em qualquer tela — inclusive na TV da
       * sala, que é o destino real — e o `max-h-[86vh]` impede que ele estoure a altura numa janela
       * baixa, caso em que ele deixa de ser quadrado de propósito: caber vence a forma.
       */}
      <div
        className={`pointer-events-auto relative flex aspect-square w-[42vw] min-w-[340px] max-w-[620px] max-h-[86vh] flex-col overflow-hidden rounded-3xl bg-slate-900 shadow-[0_0_0_9999px_rgba(2,6,23,0.55),0_25px_60px_-15px_rgba(0,0,0,0.9)] ring-[6px] ring-amber-400 transition-all duration-200 ${
          saindo ? "scale-[0.97] opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <button
          type="button"
          onClick={encerrar}
          aria-label={t("dismiss")}
          title={t("dismiss")}
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        <div className="flex flex-1 flex-col items-center justify-evenly px-[8%] py-[7%] text-center">
          {/* TRIP — o número do LH, para quem for atrás dele no portal. */}
          {atual.tripNumber ? (
            <div className="flex items-center gap-2 text-amber-400">
              <Gavel className="h-[1.4vw] min-h-4 w-[1.4vw] min-w-4 shrink-0" aria-hidden />
              <span className="font-black uppercase tracking-[0.12em] tabular-nums [font-size:clamp(0.9rem,1.5vw,1.9rem)]">
                {atual.tripNumber}
              </span>
            </div>
          ) : null}

          {/* ROTA — o maior de todos: é ela que decide se alguém corre. */}
          <div className="font-bold leading-tight text-white [font-size:clamp(1.05rem,2.1vw,2.6rem)]">
            {atual.route}
          </div>

          {/**
           * UM HORÁRIO SÓ, E COM O NOME DO PORTAL: o STA da ORIGEM (2026-08-19, a pedido).
           *
           * A viagem tem três instantes programados, e eu mostrava os dois errados. Na LT1Q8J02EEL01
           * eles eram:
           *
           *   STA origem   19/08 16:29   o caminhão precisa ESTAR lá   ← este
           *   STD origem   19/08 17:29   ele sai
           *   STA destino  20/08 01:29   chega no destino
           *
           * Só o primeiro responde a pergunta de quem vai dar lance: "consigo pôr um caminhão aí?".
           * Os outros dois são consequência, e numa TV cada campo a mais encolhe todos os outros.
           *
           * O rótulo é `STA` porque é assim que está escrito na coluna do portal. Chamar de "saída"
           * ou "chegada" obriga quem lê os dois lados a traduzir de cabeça — e foi traduzindo de
           * cabeça que esta tela ficou com o horário errado desde que nasceu.
           */}
          {atual.originArrival || atual.vehicle ? (
            <div className="flex w-full items-start justify-center gap-[12%]">
              {atual.originArrival ? (
                <Dado rotulo={t("originArrival")} valor={atual.originArrival} />
              ) : null}
              {atual.vehicle ? <Dado rotulo={t("vehicle")} valor={atual.vehicle} /> : null}
            </div>
          ) : null}
        </div>

        {/* A barra escorre com o tempo: mostra que ele vai sair sozinho, sem precisar de aviso. */}
        <div className="h-1.5 shrink-0 bg-amber-400/20">
          <div
            key={atual.id}
            className="h-full bg-amber-400"
            style={{ animation: `oferta-tempo ${DURACAO_MS}ms linear forwards` }}
          />
        </div>
      </div>

      <style>{`@keyframes oferta-tempo { from { width: 100% } to { width: 0% } }`}</style>
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <span className="leading-tight">
      <span className="block uppercase tracking-[0.12em] text-slate-500 [font-size:clamp(0.6rem,0.8vw,0.95rem)]">
        {rotulo}
      </span>
      <span className="font-semibold text-slate-100 [font-size:clamp(0.85rem,1.3vw,1.6rem)]">
        {valor}
      </span>
    </span>
  );
}
