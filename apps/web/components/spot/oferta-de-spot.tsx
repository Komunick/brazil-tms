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
      <div
        className={`pointer-events-auto w-[46vw] min-w-[380px] max-w-[880px] overflow-hidden rounded-2xl bg-slate-900 shadow-[0_0_0_9999px_rgba(2,6,23,0.55),0_25px_60px_-15px_rgba(0,0,0,0.9)] ring-1 ring-amber-400/60 transition-all duration-200 ${
          saindo ? "scale-[0.97] opacity-0" : "scale-100 opacity-100"
        }`}
      >
        {/* A faixa de cima é a única coisa em cor de alerta na tela: é ela que faz virar a cabeça. */}
        <div className="flex items-center gap-3 bg-gradient-to-r from-amber-400 to-amber-300 px-5 py-2.5 text-slate-950">
          <Gavel className="h-[1.15vw] min-h-4 w-[1.15vw] min-w-4 shrink-0" aria-hidden />
          <span className="flex-1 text-[1.15vw] font-black uppercase leading-none tracking-[0.14em] [font-size:clamp(0.8rem,1.15vw,1.4rem)]">
            {t("newOffer")}
          </span>
          {atual.tripNumber ? (
            <span className="rounded-full bg-slate-950/10 px-2.5 py-1 text-[0.95vw] font-bold tabular-nums [font-size:clamp(0.7rem,0.95vw,1.05rem)]">
              {atual.tripNumber}
            </span>
          ) : null}
          <button
            type="button"
            onClick={encerrar}
            aria-label={t("dismiss")}
            title={t("dismiss")}
            className="-mr-1 rounded-full p-1 text-slate-950/70 transition-colors hover:bg-slate-950/10 hover:text-slate-950"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="px-5 py-4">
          {/* A rota decide se alguém corre: vem primeiro e maior que o resto. */}
          <div className="text-[1.6vw] font-bold leading-tight text-white [font-size:clamp(1rem,1.6vw,2rem)]">
            {atual.route}
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
            {atual.price ? (
              <span className="text-[2vw] font-black leading-none tabular-nums text-emerald-400 [font-size:clamp(1.3rem,2vw,2.6rem)]">
                {atual.price}
              </span>
            ) : null}
            {atual.departure ? (
              <Dado rotulo={t("departure")} valor={atual.departure} />
            ) : null}
            {atual.vehicle ? <Dado rotulo={t("vehicle")} valor={atual.vehicle} /> : null}
            {fila.length > 1 ? (
              <span className="ml-auto rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                {t("queued", { count: fila.length - 1 })}
              </span>
            ) : null}
          </div>
        </div>

        {/* A barra escorre com o tempo: mostra que ele vai sair sozinho, sem precisar de aviso. */}
        <div className="h-1 bg-amber-400/20">
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
      <span className="block text-[0.62rem] uppercase tracking-wide text-slate-500">{rotulo}</span>
      <span className="text-sm font-medium text-slate-200">{valor}</span>
    </span>
  );
}
