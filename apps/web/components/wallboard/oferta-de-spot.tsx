"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { SpotOfferView } from "@brazil-tms/db";
import { estadoInicial, novasOfertas } from "@/lib/wallboard/ofertas";

/**
 * O AVISO DE OFERTA no meio da TV (2026-08-18).
 *
 * O leilão de spot tem prazo curto: quem vê primeiro dá lance. O aviso já existia no Telegram, no
 * celular de quem estava olhando; este é o mesmo aviso na parede da sala, para quem não está.
 *
 * Três decisões, e todas vêm de a tela ficar ligada o dia inteiro sem ninguém tocando nela:
 *
 *   MÉDIO, NÃO TELA CHEIA. Ele cobre o centro e deixa o quadro respirando em volta — quem está
 *   acompanhando uma viagem atrasada não perde o que estava lendo. Uma cortina cheia faria a sala
 *   pedir para desligar o aviso, e aí ele não avisa mais nada.
 *
 *   SAI SOZINHO EM 30 SEGUNDOS. Ninguém clica em TV. Aviso que precisa de clique vira cortina
 *   permanente no primeiro dia em que a sala esvazia.
 *
 *   UM DE CADA VEZ, EM FILA. Chegando três ofertas no mesmo ciclo, empilhá-las esconderia duas.
 *   A fila mostra cada uma pelos seus 30 segundos, na ordem em que chegaram.
 */

/** Quanto tempo cada aviso fica na tela. Pedido do usuário, e é tempo de ler três linhas de longe. */
const DURACAO_MS = 30_000;

export function OfertaDeSpot({ ofertas }: { ofertas: SpotOfferView[] | undefined }) {
  // A memória de "já anunciei" vive na sessão da TV, não em estado do React: recriá-la a cada render
  // faria a mesma oferta voltar a ser novidade. Ver `novasOfertas`.
  const t = useTranslations("Wallboard");
  const memoria = useRef(estadoInicial());
  const [fila, setFila] = useState<SpotOfferView[]>([]);

  useEffect(() => {
    if (!ofertas) return;
    const novas = novasOfertas(memoria.current, ofertas);
    if (novas.length > 0) setFila((atual) => [...atual, ...novas]);
  }, [ofertas]);

  const atual = fila[0];

  useEffect(() => {
    if (!atual) return;
    const t = setTimeout(() => setFila((f) => f.slice(1)), DURACAO_MS);
    return () => clearTimeout(t);
  }, [atual]);

  if (!atual) return null;

  return (
    <div
      // `pointer-events-none`: numa TV ninguém clica, e num computador o aviso não pode roubar um
      // clique de quem está trabalhando no quadro atrás dele.
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="animate-in fade-in zoom-in-95 w-[46vw] min-w-[420px] max-w-[900px] overflow-hidden rounded-2xl border-2 border-amber-400 bg-slate-900 shadow-[0_0_0_9999px_rgba(2,6,23,0.55)] duration-300">
        {/* A tarja amarela é o que faz a sala virar a cabeça: o quadro inteiro é escuro e sóbrio, e
            esta é a única coisa em cor de alerta na tela. */}
        <div className="flex items-center justify-between bg-amber-400 px-[1.6vw] py-[1vh]">
          <span className="text-[1.5vw] font-black uppercase tracking-[0.15em] text-slate-950">
            {t("spotOffer")}
          </span>
          {atual.tripNumber ? (
            <span className="text-[1.3vw] font-bold tabular-nums text-slate-950">
              {atual.tripNumber}
            </span>
          ) : null}
        </div>

        <div className="px-[1.6vw] py-[1.8vh]">
          {/* A rota é a informação que decide se alguém corre: vem primeiro e maior que o resto. */}
          <div className="text-[2vw] font-bold leading-tight text-white">{atual.route}</div>

          <div className="mt-[1.4vh] flex flex-wrap items-baseline gap-x-[2vw] gap-y-[0.8vh]">
            {atual.price ? (
              <span className="text-[2.4vw] font-black leading-none text-emerald-400 tabular-nums">
                {atual.price}
              </span>
            ) : null}
            {atual.departure ? (
              <span className="text-[1.2vw] text-slate-300">
                <span className="text-slate-500">{t("spotDeparture")} </span>
                {atual.departure}
              </span>
            ) : null}
            {atual.vehicle ? (
              <span className="text-[1.2vw] text-slate-300">{atual.vehicle}</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
