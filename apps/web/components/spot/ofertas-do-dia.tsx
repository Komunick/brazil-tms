"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Gavel } from "lucide-react";
import type { SpotOfferView } from "@brazil-tms/db";
import { formatTime } from "@brazil-tms/shared";
import { useSpotOffers } from "@/lib/trips/client";
import { AvisosDoSistema } from "@/components/spot/avisos-do-sistema";
import { Card, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * ONDE A OFERTA VAI DEPOIS DE SAIR DA TELA (2026-08-18).
 *
 * O aviso do meio dura trinta segundos e some — e some inteiro: quem estava no telefone naquele
 * minuto ficava sabendo que houve uma oferta apenas pelo Telegram. Este cartão é o destino dela: o
 * mesmo dado, pequeno, ao lado das viagens por status, pelo resto do dia.
 *
 * Divide a MESMA consulta do aviso (`useSpotOffers`), e isso é de propósito: dois recortes
 * diferentes da mesma coisa dariam duas respostas para "quantas ofertas hoje?".
 *
 * O CARTÃO INTEIRO ABRE A LISTA (2026-08-19, a pedido). Cabem cinco linhas aqui, e nelas cabem a
 * rota cortada e o horário — que é o suficiente para lembrar que houve uma oferta, e insuficiente
 * para conferir qual foi. A janela mostra o dia inteiro com TODOS os campos que o aviso mostrou.
 *
 * É o cartão todo, e não cada linha: com a lista completa a um clique, uma linha que abrisse só a
 * própria oferta seria um segundo caminho para a mesma informação — e o alvo de clique de uma linha
 * de 0,7 rem é pequeno demais para uma tela que se olha de longe.
 */
export function OfertasDoDia() {
  const t = useTranslations("Spot");
  const { data } = useSpotOffers();
  const ofertas = data?.ofertas ?? [];
  const [aberto, setAberto] = useState(false);

  const conteudo = (
    <>
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
    </>
  );

  // Sem oferta nenhuma não há o que conferir, e um cartão clicável que abre uma janela vazia é uma
  // promessa quebrada. Nesse caso ele volta a ser o cartão de antes.
  if (ofertas.length === 0) {
    return <Card className="p-2.5">{conteudo}</Card>;
  }

  return (
    <>
      <Card className="p-0 transition-colors hover:bg-muted/60">
        <button
          type="button"
          onClick={() => setAberto(true)}
          title={t("openList")}
          className="block w-full p-2.5 text-left"
        >
          {conteudo}
        </button>
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel className="h-4 w-4 text-amber-500" aria-hidden />
              {t("todayTitle")}
              {/* O `mr-6` é a distância do X: o botão de fechar do diálogo é posicionado por cima do
                  conteúdo, e sem essa margem o número fica ATRÁS dele. */}
              <span className="ml-auto mr-6 tabular-nums">{ofertas.length}</span>
            </DialogTitle>
            <DialogDescription>{t("listHint")}</DialogDescription>
          </DialogHeader>

          {/**
           * Ligar o aviso da área de trabalho mora AQUI, e não numa tela de configurações.
           *
           * É aqui que a pessoa está quando pensa no assunto — abriu a caixa de ofertas justamente
           * porque quer saber delas. Uma tela de preferências à parte é o lugar onde esse botão
           * seria escrito, deployado e nunca encontrado.
           */}
          <div className="rounded border px-3 py-2">
            <p className="mb-1.5 text-xs font-medium">{t("systemHeading")}</p>
            <AvisosDoSistema />
          </div>

          <ul className="flex flex-col gap-2">
            {ofertas.map((o) => (
              <OfertaDetalhada key={o.id} oferta={o} />
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Uma oferta com TUDO o que o aviso mostrou, mais o que não cabia nele.
 *
 * A ordem é a da decisão, a mesma do cartão grande: número da viagem para achar no portal, rota
 * porque é ela que decide se vale, e só então STA, veículo e preço. O horário de recebimento fica no
 * alto à direita porque é por ele que se cruza com o Telegram.
 *
 * Campo ausente NÃO vira "—": a maioria das ofertas chega sem preço, e uma coluna de travessões
 * repetidos ocuparia a linha inteira para dizer que não há nada a dizer.
 */
function OfertaDetalhada({ oferta }: { oferta: SpotOfferView }) {
  const t = useTranslations("Spot");
  const campos = [
    oferta.originArrival ? `${t("originArrival")} ${oferta.originArrival}` : null,
    oferta.vehicle,
    oferta.price,
  ].filter(Boolean);

  return (
    <li className="rounded-md border px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {oferta.tripNumber ?? oferta.portalTripId}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatTime(oferta.receivedAt)}
        </span>
      </div>
      {/* A rota quebra em duas linhas se precisar: aqui não há TV nem trinta segundos, e cortar o
          nome da estação seria esconder justamente o que a pessoa veio conferir. */}
      <p className="mt-0.5 break-words text-sm font-medium leading-snug">{oferta.route}</p>
      {campos.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{campos.join(" · ")}</p>
      ) : null}
    </li>
  );
}
