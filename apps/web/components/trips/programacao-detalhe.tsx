"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import type { TripStatus } from "@brazil-tms/shared";
import type { TripFilterOptions } from "@brazil-tms/db";
import { useFilterOptions, useTripDetail } from "@/lib/trips/client";
import { AssignmentForm } from "@/components/trips/dispatch/assignment-form";
import { MelhoresDaRota } from "@/components/trips/melhores-da-rota";
import { HistoricoDoMotorista } from "@/components/trips/historico-do-motorista";
import { TimelineSection } from "@/components/trips/trip-detail/timeline";
import { TripStatusBadge } from "@/components/trips/trip-status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A VIAGEM SEM SAIR DA PROGRAMAÇÃO (2026-08-24, a pedido).
 *
 * O quadro substituiu a planilha, mas ainda mandava a pessoa embora: clicar na LH abria outra tela e
 * o lugar na lista se perdia — e numa programação de 400 linhas, perder o lugar é perder o fio. A
 * janela resolve isso: os dados, a linha do tempo e a atribuição no mesmo lugar, e o quadro
 * continua atrás.
 *
 * ── NADA AQUI É NOVO, E ESSE É O PONTO ────────────────────────────────────────────────────────
 *
 * A linha do tempo é a `TimelineSection` da tela de detalhe; a atribuição é a MESMA `AssignmentForm`
 * do despacho — o caminho único de escrita, com as verificações de elegibilidade, o motivo de
 * exceção e o servidor mandando. Reescrever qualquer um dos dois aqui criaria uma segunda regra de
 * atribuição, e duas regras divergem no mês seguinte.
 *
 * ── A JANELA NÃO É A TELA DE DETALHE ──────────────────────────────────────────────────────────
 *
 * Cabe o que se decide olhando a programação: onde a viagem está, o que já aconteceu e quem vai
 * dirigir. Documento, cobrança, exceção e nota continuam na tela própria, a um clique daqui — uma
 * janela que tenta ser a página inteira vira uma página pior, dentro de um retângulo menor.
 */

/**
 * SÓ SE AINDA DÁ PARA MUDAR QUEM DIRIGE (2026-08-24, a pedido).
 *
 * A janela oferecia "editar atribuição" em QUALQUER viagem, inclusive nas que estão em trânsito,
 * no destino ou encerradas. Nessas o formulário abria e o servidor recusava a gravação — o pior dos
 * dois mundos: a tela promete uma ação que a regra não permite, e a pessoa só descobre depois de
 * preencher.
 *
 * A régua é a MESMA da tela de detalhe (`assignment-panel.tsx`), e vem de lá copiada de propósito:
 * são três valores, e uma constante compartilhada obrigaria a importar um módulo de tela dentro de
 * outro. Se um dia virar quatro, vale extrair.
 *
 * `received` é a viagem a atribuir; `assigned` e `confirmed` já têm alguém e ainda dá para trocar.
 * Do momento em que o caminhão chega à origem em diante, quem manda é o que ACONTECEU, e trocar o
 * motorista no papel não muda quem está dirigindo.
 */
const PODE_ATRIBUIR = new Set(["received", "assigned", "confirmed"]);

export function ProgramacaoDetalhe({
  tripId,
  aberto,
  aoFechar,
  resourceOptions,
}: {
  tripId: string | null;
  aberto: boolean;
  aoFechar: () => void;
  resourceOptions: TripFilterOptions;
}) {
  const t = useTranslations("Programacao");
  const tDetalhe = useTranslations("Trips.detail");
  const consulta = useTripDetail(tripId ?? "");
  const opcoes = useFilterOptions(resourceOptions);
  const [atribuindo, setAtribuindo] = useState(false);
  // O nome escolhido no ranking, empurrado para o formulário. Ver `driverIdSugerido`.
  const [sugerido, setSugerido] = useState<string | undefined>(undefined);
  // O motorista cujo histórico está aberto, vindo do botão ao lado do nome no ranking.
  const [historico, setHistorico] = useState<{ id: string; nome: string } | null>(null);

  const viagem = consulta.data?.item;
  const podeAtribuir = viagem ? PODE_ATRIBUIR.has(viagem.currentStatus) : false;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) {
          setAtribuindo(false);
          aoFechar();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono">
            {viagem?.externalTripId ?? "—"}
            {viagem ? (
              <TripStatusBadge
                status={viagem.currentStatus as TripStatus}
                portalAcceptance={viagem.customerFields?.["Aceitação (portal)"] ?? null}
                portalStatus={viagem.customerFields?.["Status (portal)"] ?? null}
              />
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {viagem ? `${viagem.originName ?? "—"} → ${viagem.destinationName ?? "—"}` : ""}
          </DialogDescription>
        </DialogHeader>

        {consulta.isPending ? <Skeleton className="h-64 w-full" /> : null}

        {viagem ? (
          <div className="space-y-4">
            {/*
              A ATRIBUIÇÃO ABRE FECHADA, e é decisão de tela: o motivo mais comum de abrir a janela é
              olhar, não mexer. O formulário tem sete campos e as verificações do servidor — aberto
              por padrão, empurraria a linha do tempo para fora da primeira tela toda vez.
            */}
            <div className="flex flex-wrap items-center gap-2">
              {podeAtribuir ? (
                <Button type="button" size="sm" onClick={() => setAtribuindo((v) => !v)}>
                  {atribuindo
                    ? t("fecharAtribuicao")
                    : viagem.currentAssignment
                      ? t("editarAtribuicao")
                      : t("atribuir")}
                </Button>
              ) : (
                // Dizer POR QUE o botão não está aqui, em vez de simplesmente não mostrá-lo: um
                // botão que some sem explicação faz a pessoa procurar o defeito na tela.
                <p className="text-xs text-muted-foreground">{t("naoDaParaEditar")}</p>
              )}
              <Button asChild type="button" size="sm" variant="ghost">
                <Link href={`/trips/${viagem.id}`}>
                  <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden />
                  {t("abrirTelaCompleta")}
                </Link>
              </Button>
            </div>

            {/*
              O RANKING FICA AO LADO, NÃO EM CIMA (2026-08-24, a pedido: "um top 10 ao lado").
              Quem escala olha os dois ao mesmo tempo: o campo que vai preencher e quem já entregou
              bem naquela rota. Empilhado, o ranking sairia da tela assim que o formulário abrisse —
              e um painel que só aparece rolando é um painel que ninguém lê na hora de decidir.
              Em tela estreita ele desce para baixo, porque duas colunas de 20rem não cabem.
            */}
            {atribuindo && podeAtribuir ? (
              <div className="grid gap-3 rounded-md border p-3 lg:grid-cols-[1fr_16rem]">
                <AssignmentForm
                  tripId={viagem.id}
                  currentStatus={viagem.currentStatus as TripStatus}
                  currentAssignment={viagem.currentAssignment ?? null}
                  resourceOptions={opcoes}
                  onDone={() => setAtribuindo(false)}
                  driverIdSugerido={sugerido}
                />
                <MelhoresDaRota
                  tripId={viagem.id}
                  aberto={aberto}
                  opcoes={opcoes.drivers}
                  onEscolher={setSugerido}
                  quantos={10}
                  onVerHistorico={(id, nome) => setHistorico({ id, nome })}
                />
              </div>
            ) : null}

            <section aria-label={tDetalhe("timeline")}>
              <TimelineSection trip={viagem} />
            </section>
          </div>
        ) : null}
      </DialogContent>

      {/*
        O histórico abre POR CIMA desta janela, e não no lugar dela: quem investiga um motorista
        está no meio de uma atribuição, e perder o formulário para consultar seria pagar a consulta
        com o trabalho já feito.
      */}
      <HistoricoDoMotorista
        driverId={historico?.id ?? null}
        nome={historico?.nome ?? null}
        aberto={historico !== null}
        aoFechar={() => setHistorico(null)}
        tripId={viagem?.id}
      />
    </Dialog>
  );
}
