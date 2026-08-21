"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, Flag, GitBranch, History, Lock, MapPin, PlayCircle, Truck } from "lucide-react";
import { FLEET_ALERT_KEYS, fleetAlerts, fromUtc, type FleetAlertKey } from "@brazil-tms/shared";
import type { FleetPositionView } from "@brazil-tms/db";
import { useFleet } from "@/lib/fleet/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * A frota inteira, como o rastreador a enxerga (2026-08-20).
 *
 * A tela do fornecedor já existe e é melhor no que ela faz — mapa, trilha, histórico. Esta não tenta
 * competir: ela existe para pôr o caminhão ao lado do que o TMS sabe da VIAGEM, que é o cruzamento
 * que nenhuma das duas telas faz sozinha.
 *
 * ── A COLUNA QUE JUSTIFICA A PÁGINA ────────────────────────────────────────────────────────────
 *
 * `PREVISÃO` é a chegada calculada pela estrada. O risco de SLA do TMS é medido pelo relógio contra
 * a janela planejada, sem saber se faltam 40 km ou 1.000. Enquanto o vínculo com a LH não existe,
 * esta coluna já permite a conferência à mão — e é ela que vai alimentar o vínculo depois.
 *
 * ── SEM CADASTRO NÃO É ERRO ────────────────────────────────────────────────────────────────────
 *
 * Placa que o rastreador vê e o TMS não tem aparece marcada, não escondida. É informação: ou falta
 * cadastrar o veículo, ou ele saiu da frota e ninguém avisou o rastreador.
 */

/** Uma hora sem posição nova é a régua do quadro — a mesma daqui, para os dois não discordarem. */
const SILENCIO_MS = 60 * 60 * 1000;

function idade(iso: string | null): { texto: string; velho: boolean } {
  if (!iso) return { texto: "—", velho: true };
  const ms = Date.now() - new Date(iso).getTime();
  const minutos = Math.floor(ms / 60000);
  if (minutos < 60) return { texto: `${minutos} min`, velho: ms > SILENCIO_MS };
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return { texto: `${horas} h`, velho: true };
  return { texto: `${Math.floor(horas / 24)} d`, velho: true };
}

const hora = (iso: string | null): string => (iso ? fromUtc(iso).toFormat("dd/MM HH:mm") : "—");

/**
 * OS OITO ÍCONES, NA ORDEM DA TELA DO FORNECEDOR (2026-08-21, a pedido).
 *
 * A ordem e a forma são deliberadamente as mesmas do eTorre: a sala já lê aqueles oito de relance,
 * e reordenar ou reinventar os símbolos custaria a única coisa que essa coluna tem de bom, que é
 * não precisar ser aprendida. Cada Lucide aqui é o par do Font Awesome de lá — ramo, caminhão,
 * relógio com seta, alfinete, play, cadeado, sino, bandeira.
 *
 * Verde é o estado bom e vermelho é o alerta, como lá. Verde NÃO é decoração: é a afirmação de que
 * aquele farol foi verificado. Mostrar só os acesos pouparia pixels e perderia isso — uma linha com
 * nenhum ícone seria indistinguível de uma leitura antiga de robô velho, que é justamente o caso em
 * que ninguém pode confiar no silêncio.
 */
const ICONES: Record<FleetAlertKey, typeof GitBranch> = {
  foraDeRota: GitBranch,
  paradoDemais: Truck,
  jornadaExcedida: History,
  semPosicao: MapPin,
  inicioAtrasado: PlayCircle,
  bloqueio: Lock,
  sirene: Bell,
  liberacao: Flag,
};

function Alertas({ v, t }: { v: FleetPositionView; t: (k: string, p?: never) => string }) {
  const acesos = fleetAlerts(v);
  return (
    <div className="flex items-center gap-1">
      {FLEET_ALERT_KEYS.map((chave) => {
        const Icone = ICONES[chave];
        const aceso = acesos.has(chave);
        // O título carrega a frase inteira, dos dois lados: "fora da rota" e "dentro da rota" são
        // informações diferentes, e quem passa o mouse quer confirmar qual das duas está vendo.
        const rotulo = t(aceso ? `alert_${chave}_on` : `alert_${chave}_off`);
        return (
          <span key={chave} title={rotulo} aria-label={rotulo}>
            <Icone
              aria-hidden
              className={`h-3.5 w-3.5 ${aceso ? "text-destructive" : "text-success"}`}
            />
          </span>
        );
      })}
    </div>
  );
}

export function FleetClient() {
  const t = useTranslations("Fleet");
  const { data, isLoading, isError } = useFleet();
  const [busca, setBusca] = useState("");

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-2 py-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-6">
          <p role="alert" className="text-sm text-destructive">
            {t("loadError")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const termo = busca.trim().toUpperCase();
  // Busca sobre placa, motorista e cidades: são os três jeitos pelos quais alguém procura um
  // caminhão quando o telefone toca.
  const linhas = termo
    ? data.items.filter((v) =>
        [v.plate, v.trailerPlate, v.driverLabel, v.originCity, v.destinationCity]
          .filter(Boolean)
          .some((campo) => campo!.toUpperCase().includes(termo)),
      )
    : data.items;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="max-w-xs"
          aria-label={t("searchPlaceholder")}
        />
        <span className="text-xs text-muted-foreground">
          {t("shown", { shown: linhas.length, total: data.items.length })}
          {data.summary.lastReceivedAt
            ? ` · ${t("lastRead", { time: fromUtc(data.summary.lastReceivedAt).toFormat("HH:mm") })}`
            : ""}
        </span>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("plate")}</TableHead>
                <TableHead>{t("driver")}</TableHead>
                <TableHead>{t("trip")}</TableHead>
                <TableHead className="text-right">{t("progress")}</TableHead>
                <TableHead>{t("eta")}</TableHead>
                <TableHead>{t("risk")}</TableHead>
                <TableHead>{t("alerts")}</TableHead>
                <TableHead>{t("position")}</TableHead>
                <TableHead className="text-right">{t("age")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-sm text-muted-foreground">
                    {t("noMatch")}
                  </TableCell>
                </TableRow>
              ) : (
                linhas.map((v) => <Linha key={v.plate} v={v} t={t} />)
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

/**
 * O prazo do CLIENTE, não o do rastreador.
 *
 * Quando não há viagem do TMS com este veículo, a coluna diz isso em vez de mostrar um traço: sem
 * viagem não há promessa a furar, e "—" faria pensar em dado faltando.
 */
function Risco({
  risco,
  temViagem,
  t,
}: {
  risco: FleetPositionView["risk"];
  temViagem: boolean;
  t: (k: string) => string;
}) {
  if (risco === "sem_base") {
    return (
      <span className="text-xs text-muted-foreground">
        {temViagem ? t("riskUnknown") : t("noTrip")}
      </span>
    );
  }
  const estilo =
    risco === "atrasada"
      ? "border-destructive/50 text-destructive"
      : risco === "vai_atrasar"
        ? "border-warning/50 text-warning"
        : "border-success/50 text-success";
  const rotulo =
    risco === "atrasada" ? "riskLate" : risco === "vai_atrasar" ? "riskWillDelay" : "riskOnTime";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[0.7rem] ${estilo}`}>
      {t(rotulo)}
    </span>
  );
}

function Linha({ v, t }: { v: FleetPositionView; t: (k: string, p?: never) => string }) {
  const comunicacao = idade(v.positionAt);
  const parado = (v.stoppedFlag ?? "").toUpperCase().startsWith("MOV") === false;

  return (
    <TableRow>
      <TableCell className="font-medium tabular-nums">
        {v.plate}
        {v.trailerPlate ? (
          <span className="ml-1.5 text-xs text-muted-foreground">{v.trailerPlate}</span>
        ) : null}
        {!v.vehicleId ? (
          // Marcado, não escondido: ou falta cadastrar, ou o veículo saiu da frota e o rastreador não
          // soube. Os dois pedem ação de gente.
          <span className="ml-1.5 rounded border border-warning/50 px-1 text-[0.6rem] uppercase text-warning">
            {t("unregistered")}
          </span>
        ) : null}
      </TableCell>
      <TableCell className="text-sm">{v.driverLabel ?? "—"}</TableCell>
      <TableCell className="text-sm">
        {v.originCity || v.destinationCity ? (
          <span>
            {v.originCity ?? "—"} <span className="text-muted-foreground">→</span>{" "}
            {v.destinationCity ?? "—"}
          </span>
        ) : (
          <span className="text-muted-foreground">{v.tripStatus ?? "—"}</span>
        )}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {v.progressPercent == null ? "—" : `${v.progressPercent.toFixed(0)}%`}
      </TableCell>
      <TableCell className="text-sm tabular-nums">{hora(v.etaAt)}</TableCell>
      <TableCell className="text-sm">
        <Risco risco={v.risk} temViagem={Boolean(v.tripId)} t={t} />
      </TableCell>
      <TableCell>
        <Alertas v={v} t={t} />
      </TableCell>
      <TableCell className="max-w-[22rem] truncate text-sm" title={v.positionLabel ?? undefined}>
        {v.positionLabel ?? "—"}
        {parado ? (
          <span className="ml-1.5 text-xs text-muted-foreground">{t("halted")}</span>
        ) : null}
      </TableCell>
      <TableCell
        className={`text-right text-sm tabular-nums ${comunicacao.velho ? "text-destructive" : "text-muted-foreground"}`}
      >
        {comunicacao.texto}
      </TableCell>
    </TableRow>
  );
}
