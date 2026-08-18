"use client";

import { useTranslations } from "next-intl";
import { Gavel } from "lucide-react";
import { formatTime } from "@brazil-tms/shared";
import { useSpotOffers } from "@/lib/trips/client";
import { Card, CardTitle } from "@/components/ui/card";

/**
 * ONDE A OFERTA VAI DEPOIS DE SAIR DA TELA (2026-08-18).
 *
 * O aviso do meio dura trinta segundos e some — e some inteiro: quem estava no telefone naquele
 * minuto ficava sabendo que houve uma oferta apenas pelo Telegram. Este cartão é o destino dela: o
 * mesmo dado, pequeno, ao lado das viagens por status, pelo resto do dia.
 *
 * Divide a MESMA consulta do aviso (`useSpotOffers`), e isso é de propósito: dois recortes
 * diferentes da mesma coisa dariam duas respostas para "quantas ofertas hoje?".
 */
export function OfertasDoDia() {
  const t = useTranslations("Spot");
  const { data } = useSpotOffers();
  const ofertas = data?.ofertas ?? [];

  return (
    <Card className="p-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <CardTitle className="flex items-center gap-1.5 text-[0.68rem] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
          <Gavel className="h-3 w-3 text-amber-500" aria-hidden />
          {t("todayTitle")}
        </CardTitle>
        <span className="text-lg font-bold leading-none tabular-nums">{ofertas.length}</span>
      </div>

      {ofertas.length === 0 ? (
        // Vazio é o estado NORMAL: leilão é evento, não fluxo. A frase diz isso, para o silêncio não
        // parecer defeito de quem olha o painel às 9h da manhã.
        <p className="text-[0.7rem] leading-snug text-muted-foreground">{t("todayEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {ofertas.slice(0, 5).map((o) => (
            <li key={o.id} className="flex items-baseline justify-between gap-2 text-[0.7rem]">
              {/* A rota inteira não cabe aqui; o título completo fica no atributo, para quem parar o
                  mouse em cima. O horário é o de chegada do aviso — é por ele que se procura no
                  Telegram o que foi decidido. */}
              <span className="truncate font-medium" title={o.route}>
                {o.route}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {o.price ? <span className="font-semibold text-success">{o.price}</span> : null}
                <span className="ml-1.5">{formatTime(o.receivedAt)}</span>
              </span>
            </li>
          ))}
          {ofertas.length > 5 ? (
            <li className="text-[0.65rem] text-muted-foreground">
              {t("todayMore", { count: ofertas.length - 5 })}
            </li>
          ) : null}
        </ul>
      )}
    </Card>
  );
}
