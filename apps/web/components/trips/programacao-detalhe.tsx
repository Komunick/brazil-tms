"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import type { TripStatus, VehicleType } from "@brazil-tms/shared";
import { useTripDetail } from "@/lib/trips/client";
import { PortalAssignDialog } from "@/components/trips/portal-assign-dialog";
import { PreSmStatus } from "@/components/trips/pre-sm-status";
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
 * A linha do tempo é a `TimelineSection` da tela de detalhe; a atribuição é o MESMO
 * `PortalAssignDialog` da Expedição — o caminho único, que enfileira a ordem para o robô executar no
 * portal. Reescrever qualquer um dos dois aqui criaria uma segunda regra de atribuição, e duas
 * regras divergem no mês seguinte.
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
}: {
  tripId: string | null;
  aberto: boolean;
  aoFechar: () => void;
}) {
  const t = useTranslations("Programacao");
  const tDetalhe = useTranslations("Trips.detail");
  const consulta = useTripDetail(tripId ?? "");
  const [atribuindo, setAtribuindo] = useState(false);
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
              A ATRIBUIÇÃO ABRE NUM DIÁLOGO, e não embutida: o motivo mais comum de abrir esta janela
              é olhar, não mexer. Embutido, o formulário empurraria a linha do tempo para fora da
              primeira tela toda vez — e este é o mesmo diálogo que a Expedição abre, com as mesmas
              verificações e o mesmo aviso de resultado.
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

            {/**
             * QUEM ESCALA É O PORTAL, e por isso este é o diálogo do portal (2026-08-25).
             *
             * Aqui havia a `AssignmentForm` — a escala interna do TMS, que grava aqui e NÃO vai ao
             * portal. O usuário substituía a atribuição, ia conferir no portal e não achava nada:
             * a ordem nunca tinha sido pedida.
             *
             * É o mesmo defeito que a Expedição teve e resolveu em 2026-08-22, e pela mesma razão:
             * dois botões escritos "Atribuir", um que sai e outro que fica. Lá a escala interna foi
             * removida, com o número que decide a questão — das atribuições vigentes, TODAS vieram
             * do robô leitor e NENHUMA de uma pessoa. Ela não serve a ninguém; só confunde.
             *
             * O ranking do rodapé sumiu daqui porque o diálogo do portal já traz o seu, ligado à
             * lista CERTA: o que estava aqui casava o nome com o cadastro do TMS, e o campo que
             * precisa ser preenchido é o do portal.
             */}
            {podeAtribuir ? (
              <PortalAssignDialog
                tripId={viagem.id}
                externalTripId={viagem.externalTripId}
                vehicleType={(viagem.plannedVehicleType as VehicleType | null) ?? null}
                /* O que o PORTAL tem escalado hoje, para a edição abrir preenchida. As chaves são as
                   que `portal-trip-facts.ts` grava — as mesmas que o quadro da Expedição lê. */
                driverAtual={viagem.customerFields?.["ID do motorista (portal)"] ?? null}
                placaAtual={viagem.customerFields?.["Placa (portal)"] ?? null}
                quantosMelhores={10}
                onVerHistorico={(id, nome) => setHistorico({ id, nome })}
                open={atribuindo}
                onOpenChange={setAtribuindo}
              />
            ) : null}

            {/* A Pré-SM fica ACIMA da linha do tempo: ela é sobre o que vai acontecer (a escolta
                da viagem que está sendo escalada), e a linha do tempo é sobre o que já aconteceu.
                E quando ela NÃO foi criada, o motivo é acionável agora — não daqui a três dias. */}
            <PreSmStatus tripId={viagem.id} />

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
