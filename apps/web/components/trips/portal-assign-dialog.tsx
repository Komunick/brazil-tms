"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  impedimentoDaAtribuicao,
  normalizarPlaca,
  placasDoPortal,
  placasEsperadas,
  type VehicleType,
} from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MelhoresDaRota } from "@/components/trips/melhores-da-rota";
import { TripsError, usePortalAction, usePortalDrivers } from "@/lib/trips/client";

/**
 * ESCALAR MOTORISTA E PLACA SEM ABRIR O PORTAL (2026-08-21, a pedido).
 *
 * A segunda metade do fluxo do aceite. No portal, aceitar leva a esta mesma tela; aqui ela abre a
 * partir da aba "Atribuir" — que é a fila de quem já foi aceito e ainda não tem quem dirija.
 *
 * ── O MOTORISTA VEM DA LISTA DO PORTAL, NÃO DO NOSSO CADASTRO ──────────────────────────────────
 *
 * O portal aceita o id DELE, e só quem está no cadastro dele. Nosso cadastro tem 1.378 nomes; o que
 * serve aqui são os 536 que o portal já nos mostrou em viagens reais — ordenados por quem rodou mais
 * recentemente, que é como a operação pensa neles. Ver `portal-drivers.ts`.
 *
 * ── UMA OU DUAS PLACAS ─────────────────────────────────────────────────────────────────────────
 *
 * Carreta leva duas (cavalo e reboque); o resto leva uma. O padrão vem do tipo do veículo da viagem,
 * mas o campo é ACRESCENTÁVEL: a regra é nossa sobre um dado do fornecedor, e no dia em que ela não
 * couber, quem está olhando a viagem conserta na hora — em vez de ficar preso a um formulário que
 * discorda do que está na frente dele.
 */
export function PortalAssignDialog({
  tripId,
  externalTripId,
  vehicleType,
  driverAtual,
  placaAtual,
  onSent,
  quantosMelhores,
  onVerHistorico,
  open,
  onOpenChange,
}: {
  tripId: string;
  externalTripId: string | null;
  /** O tipo planejado da viagem — decide quantas placas o formulário abre pedindo. */
  vehicleType: VehicleType | null;
  /**
   * O que o PORTAL tem escalado hoje, para a edição abrir preenchida — como a dele abre.
   *
   * Sem isto, trocar só o motorista obrigaria a redigitar a placa, e redigitar é onde o erro entra.
   * Vem do portal e não da atribuição do TMS de propósito: o que se está editando é o que o CLIENTE
   * enxerga.
   */
  driverAtual?: string | null;
  placaAtual?: string | null;
  /** Chamado quando a ordem entrou na fila — quem desenha usa para acompanhar o resultado. */
  onSent?: () => void;
  /**
   * Quantos nomes o ranking mostra, e o que fazer no botão de histórico ao lado de cada um.
   *
   * Existem porque a Minha Programação abre este mesmo diálogo numa janela larga, onde cabem dez
   * nomes e onde o histórico do motorista foi pedido (2026-08-24). Na Expedição o diálogo é
   * estreito e nenhum dos dois vem — o padrão do ranking continua valendo.
   */
  quantosMelhores?: number;
  onVerHistorico?: (driverId: string, nome: string) => void;
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const t = useTranslations("Trips.portalAssign");
  const motoristas = usePortalDrivers();
  const acao = usePortalAction(tripId);

  const quantas = placasEsperadas(vehicleType);
  const [driverId, setDriverId] = useState(driverAtual ?? "");
  const [secondDriverId, setSecondDriverId] = useState("");
  /**
   * AS PLACAS DO PORTAL VÊM NUMA STRING SÓ, separadas por vírgula (2026-08-22).
   *
   * Uma carreta chega como `"PXW0I78,EMU0J25"` — cavalo e reboque no mesmo campo. A primeira
   * versão disto jogava a string inteira no campo 1, e como `normalizarPlaca` apaga tudo que não
   * é letra ou número, a vírgula sumia e o campo virava `"PXW0I78EMU0J25"`: as duas placas
   * grudadas num campo, o segundo vazio. Foi o usuário quem viu.
   *
   * QUANTOS CAMPOS MOSTRAR sai do maior entre o que o tipo do veículo pede e o que o portal já
   * tem. O tipo é uma regra NOSSA sobre um dado deles e pode envelhecer; o que está escalado hoje
   * é fato. Quando os dois discordam, esconder uma placa que existe seria o pior dos erros —
   * salvar apagaria do portal um reboque que ninguém pediu para tirar.
   */
  const [placas, setPlacas] = useState<string[]>(() => {
    const doPortal = placasDoPortal(placaAtual);
    const campos = Math.max(quantas, doPortal.length);
    return Array.from({ length: campos }, (_, i) => doPortal[i] ?? "");
  });

  /**
   * NÃO HÁ EFEITO PARA LIMPAR O FORMULÁRIO — e essa ausência é a correção.
   *
   * A primeira versão limpava os campos num `useEffect` ao abrir. Para calar o lint eu pus o objeto
   * da mutação nas dependências, e ele é RECRIADO a cada render: efeito roda, muda estado,
   * re-renderiza, roda de novo. Laço infinito, e a tela inteira caiu com "Maximum update depth" —
   * na primeira vez que alguém tentou atribuir de verdade.
   *
   * Quem garante o formulário limpo agora é o `key={row.id}` de quem desenha este diálogo: trocar de
   * viagem MONTA outro componente, e estado novo nasce vazio por definição. Sem efeito, sem
   * dependência para errar, e sem o risco de herdar o motorista da viagem anterior — que era o que
   * o efeito existia para evitar.
   */
  const opcoes = useMemo(
    () =>
      (motoristas.data?.items ?? []).map((m) => ({
        id: String(m.portalDriverId),
        label: m.name,
      })),
    [motoristas.data],
  );

  const preenchidas = placas.map(normalizarPlaca).filter(Boolean);
  const impedimento = impedimentoDaAtribuicao({
    driverId: Number(driverId) || 0,
    secondDriverId: secondDriverId ? Number(secondDriverId) : null,
    plates: preenchidas,
  });
  const erroDoServidor = acao.error instanceof TripsError ? acao.error.message : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{driverAtual ? t("titleEdit") : t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle", { lh: externalTripId ?? tripId })}</DialogDescription>
        </DialogHeader>

        {/**
         * DUAS COLUNAS: o formulário e, ao lado, quem já entregou bem NESTA rota.
         *
         * Ao lado e não embaixo — a lista existe para ser lida ENQUANTO se escolhe o nome, e um
         * painel abaixo do botão de confirmar chega depois da decisão. Em tela estreita ele desce,
         * porque aí não há "ao lado".
         *
         * Ele NÃO seleciona ninguém: é sugestão ao lado do campo. Motorista tem folga, região,
         * carreta e mil coisas que o TMS não sabe.
         */}
        <div className="grid gap-4 sm:grid-cols-[1fr_18rem]">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`motorista-${tripId}`}>{t("driver")}</Label>
              <SearchableSelect
                id={`motorista-${tripId}`}
                value={driverId}
                onChange={setDriverId}
                options={opcoes}
                placeholder={motoristas.isLoading ? t("loadingDrivers") : t("driverPlaceholder")}
                emptyText={t("noDriver")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`motorista2-${tripId}`}>{t("secondDriver")}</Label>
              <SearchableSelect
                id={`motorista2-${tripId}`}
                value={secondDriverId}
                onChange={setSecondDriverId}
                options={opcoes}
                placeholder={t("secondDriverPlaceholder")}
                emptyText={t("noDriver")}
                clearable
                clearLabel={t("noSecondDriver")}
              />
            </div>

            {placas.map((placa, i) => (
              <div key={i} className="space-y-1.5">
                <Label htmlFor={`placa-${tripId}-${i}`}>
                  {placas.length > 1 ? t("plateN", { n: String(i + 1) }) : t("plate")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`placa-${tripId}-${i}`}
                    value={placa}
                    maxLength={8}
                    autoComplete="off"
                    className="uppercase"
                    onChange={(e) =>
                      setPlacas((atual) =>
                        atual.map((p, j) => (j === i ? normalizarPlaca(e.target.value) : p)),
                      )
                    }
                  />
                  {placas.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setPlacas((atual) => atual.filter((_, j) => j !== i))}
                    >
                      {t("removePlate")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}

            {placas.length < 2 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPlacas((a) => [...a, ""])}
              >
                {t("addPlate")}
              </Button>
            ) : null}

            {erroDoServidor ? (
              <p role="alert" className="text-sm text-destructive">
                {erroDoServidor}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">{t("hint")}</p>
          </div>

          <MelhoresDaRota
            tripId={tripId}
            aberto={open}
            opcoes={opcoes}
            onEscolher={setDriverId}
            quantos={quantosMelhores}
            onVerHistorico={onVerHistorico}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={acao.isPending} onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            disabled={acao.isPending || impedimento !== null}
            onClick={() =>
              acao.mutate(
                {
                  action: "assign",
                  driverId: Number(driverId),
                  secondDriverId: secondDriverId ? Number(secondDriverId) : null,
                  plates: preenchidas,
                },
                {
                  onSuccess: () => {
                    onSent?.();
                    onOpenChange(false);
                  },
                },
              )
            }
          >
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
