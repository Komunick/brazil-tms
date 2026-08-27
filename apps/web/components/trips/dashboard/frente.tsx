"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { boardQueryForDisplayStatus, type TripDisplayStatus } from "@brazil-tms/shared";
import { Card, CardTitle } from "@/components/ui/card";
import { BOARD_ANCHOR } from "@/components/trips/control-tower-table";
import { cn } from "@/lib/utils";

/**
 * A LINHA DA FRENTE — o quadro branco, com as colunas por assunto (2026-08-27, a pedido).
 *
 * ── O QUE MUDOU, E POR QUE ────────────────────────────────────────────────────────────────────
 *
 * As colunas eram os DIAS (hoje · D1 · D2), e cada célula respondia "como está esta frente neste
 * dia" — a lista inteira de status, mais spot e origem atrasada no cartão de hoje.
 *
 * Agora são os ASSUNTOS do quadro branco da operação: PLAN, SPOT, ORIGEM. Cada coluna responde uma
 * pergunta só, e a mesma pergunta em todas as frentes — que é como se lê um quadro: descendo a
 * coluna, não varrendo a linha.
 *
 * ── O QUE SAIU DA TELA, E ISSO PRECISA ESTAR DITO ─────────────────────────────────────────────
 *
 * A visão "como está HOJE inteiro" saiu junto: ETA Origem, Em trânsito, Concluída e Cancelada não
 * aparecem mais aqui. O PLAN mostra só Atribuída e P/Atribuir, que é o que o quadro pede — o resto
 * dessa leitura vive na Torre de Controle.
 *
 * Foi decisão do usuário em 27/08, com o custo declarado antes. Voltar é trocar as colunas de volta:
 * o dado dos três dias continua vindo inteiro do servidor.
 *
 * ── O QUE **NÃO** SAIU, E NÃO PODIA SAIR ──────────────────────────────────────────────────────
 *
 * A faixa vermelha de LH ATRASADA. Ela não está no quadro branco, e sumir com ela seria trocar um
 * alarme por um desenho: é a única coisa nesta tela que diz "alguém precisa agir AGORA". Ficou na
 * coluna ORIGEM, junto da origem atrasada — as duas respondem "o que está atrasado nesta frente".
 */

interface PorStatus {
  status: TripDisplayStatus;
  count: number;
}

export interface DadosDaFrente {
  region: string | null;
  /** D1 e D2 — o horizonte de planejamento do quadro (H+12 / H+24). */
  d1: PorStatus[];
  d2: PorStatus[];
  /** Filtros de data prontos, para o atalho abrir a lista exatamente do dia mostrado. */
  filtroD1: string;
  filtroD2: string;
  atrasadas: number;
  origemAtrasada: number;
  spot?: { aceito: number; naoAceito: number; rotas: { rota: string; aceito: boolean }[] };
}

/** Os dois status que o PLAN mostra. O quadro escreve "ATRIBUIDO E P/ATRIBUIR", e é literal. */
const DO_PLAN: TripDisplayStatus[] = ["to_assign", "assigned"];

export function LinhaDaFrente({ dados }: { dados: DadosDaFrente }) {
  const t = useTranslations("Trips.dashboard");
  const tStatus = useTranslations("Trips.status");
  const { region } = dados;

  /**
   * Estação sem região não tem para onde o link apontar — `region=` vazio traria o país inteiro, e
   * um cartão que abre uma lista maior que ele próprio é pior que um que não abre.
   */
  const filtroRegiao = region ? `&region=${encodeURIComponent(region)}` : "";

  return (
    <section className="space-y-1.5">
      <h3 className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {region ?? t("regionUnassigned")}
      </h3>
      <div className="grid gap-2 lg:grid-cols-[2fr_1fr_1fr]">
        {/* PLAN — os dois dias lado a lado, cada um com os dois status que importam para planejar. */}
        <Card className="p-2.5">
          <CardTitle className="mb-1.5 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
            {t("blocoPlan")}
          </CardTitle>
          <div className="grid grid-cols-2 gap-2">
            <Dia
              rotulo={t("blocoD1")}
              porStatus={dados.d1}
              filtroData={dados.filtroD1}
              filtroRegiao={filtroRegiao}
              tStatus={tStatus}
            />
            <Dia
              rotulo={t("blocoD2")}
              porStatus={dados.d2}
              filtroData={dados.filtroD2}
              filtroRegiao={filtroRegiao}
              tStatus={tStatus}
            />
          </div>
        </Card>

        <BlocoSpot spot={dados.spot} rotulo={t("blocoSpot")} vazio={t("spotVazio")} t={t} />

        {/* ORIGEM — o que está atrasado nesta frente. As duas faixas, na mesma coluna. */}
        <Card className="p-2.5">
          <CardTitle className="mb-1.5 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
            {t("blocoOrigem")}
          </CardTitle>
          {dados.atrasadas === 0 && dados.origemAtrasada === 0 ? (
            <p className="text-xs text-muted-foreground">{t("semAtraso")}</p>
          ) : null}
          {/*
            A LH ATRASADA, piscando. A regra da operação: a viagem pode ser atribuída até o MEIO-DIA
            do dia da coleta; depois disso, sem ninguém escalado, é atraso.

            `motion-safe:` no pisca, e não animação crua: quem reduziu movimento no sistema continua
            vendo a faixa vermelha, parada. O aviso é a COR e o número; o pisca é reforço, e reforço
            não pode ser a única forma de perceber.
          */}
          {dados.atrasadas > 0 ? (
            <Link
              href={`/trips?lateToAssign=true${filtroRegiao}&scope=all#${BOARD_ANCHOR}`}
              className="mb-1.5 flex items-center justify-between gap-2 rounded bg-destructive px-1.5 py-1 text-xs font-bold uppercase tracking-wide text-destructive-foreground shadow-[0_0_10px_2px_hsl(var(--destructive)/0.75)] motion-safe:animate-pulse"
            >
              <span>{t("lateToAssign")}</span>
              <span className="tabular-nums">{dados.atrasadas}</span>
            </Link>
          ) : null}
          {/*
            O atalho leva à lista pelo MESMO predicado que contou o número, e SEM recorte de data: a
            regra já traz a sua própria janela. Passar a data por cima faria a lista mostrar menos do
            que o cartão diz.
          */}
          {dados.origemAtrasada > 0 ? (
            <Link
              href={`/trips?origemAtrasada=true${filtroRegiao}&scope=all#${BOARD_ANCHOR}`}
              className="flex items-center justify-between gap-2 rounded bg-destructive px-1.5 py-1 text-xs font-bold uppercase tracking-wide text-destructive-foreground shadow-[0_0_10px_2px_hsl(var(--destructive)/0.75)] motion-safe:animate-pulse"
            >
              <span>{t("origemAtrasada")}</span>
              <span className="tabular-nums">{dados.origemAtrasada}</span>
            </Link>
          ) : null}
        </Card>
      </div>
    </section>
  );
}

/** Um dia dentro do PLAN: só Atribuída e P/Atribuir, cada um levando à lista daquele dia. */
function Dia({
  rotulo,
  porStatus,
  filtroData,
  filtroRegiao,
  tStatus,
}: {
  rotulo: string;
  porStatus: PorStatus[];
  filtroData: string;
  filtroRegiao: string;
  tStatus: (k: string) => string;
}) {
  const de = new Map(porStatus.map((s) => [s.status, s.count]));
  return (
    <div className="rounded border bg-muted/30 p-1.5">
      <p className="mb-1 text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </p>
      {DO_PLAN.map((status) => {
        const valor = de.get(status) ?? 0;
        return (
          <Link
            key={status}
            href={`/trips?${boardQueryForDisplayStatus(status)}${filtroData}${filtroRegiao}&scope=all#${BOARD_ANCHOR}`}
            className={cn(
              "flex items-center justify-between gap-2 rounded px-1 py-0.5 text-xs hover:bg-accent",
              // Zero fica apagado em vez de sumir: a ausência da linha faria parecer que o status
              // não existe naquele dia, e a pessoa procuraria o número em outro lugar.
              valor === 0 && "text-muted-foreground/50",
            )}
          >
            <span className="truncate">{tStatus(status)}</span>
            <span className="shrink-0 font-semibold tabular-nums">{valor}</span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * SPOT — o número e, ao clicar, os nomes das rotas.
 *
 * "4 aceitas" não diz se a frente pegou as quatro que importavam ou quatro que ninguém queria. Quem
 * cuida da frente reconhece a rota pelo nome, e é isso que transforma o número em informação.
 *
 * FECHADO POR PADRÃO. Aberto sempre, as rotas de três frentes empurrariam o resto do painel para
 * fora da tela — e na maior parte do tempo o número basta. O quadro branco pede exatamente isso:
 * "aceitos + nome da rota AO CLICAR".
 */
function BlocoSpot({
  spot,
  rotulo,
  vazio,
  t,
}: {
  spot?: { aceito: number; naoAceito: number; rotas: { rota: string; aceito: boolean }[] };
  rotulo: string;
  vazio: string;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const [aberto, setAberto] = useState(false);
  const houve = spot && spot.aceito + spot.naoAceito > 0;

  return (
    <Card className="p-2.5">
      <CardTitle className="mb-1.5 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </CardTitle>
      {!houve ? (
        <p className="text-xs text-muted-foreground">{vazio}</p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setAberto((x) => !x)}
            aria-expanded={aberto}
            // Sem rota nenhuma não há o que abrir — o botão vira texto, em vez de prometer um clique
            // que não responde.
            disabled={spot.rotas.length === 0}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded border border-[hsl(28_75%_78%)] bg-[hsl(30_95%_93%)] px-1.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-[hsl(22_80%_34%)] dark:border-[hsl(28_50%_34%)] dark:bg-[hsl(26_55%_18%)] dark:text-[hsl(30_90%_72%)]",
              spot.rotas.length > 0 && "hover:brightness-95",
            )}
          >
            <span className="tabular-nums">
              {t("spotNumeros", { aceito: spot.aceito, passou: spot.naoAceito })}
            </span>
            {spot.rotas.length > 0 ? (
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", aberto && "rotate-180")}
                aria-hidden
              />
            ) : null}
          </button>
          {aberto ? (
            <ul className="mt-1.5 space-y-0.5">
              {spot.rotas.map((r, i) => (
                <li
                  key={`${r.rota}-${i}`}
                  className="flex items-start gap-1.5 text-[0.7rem] leading-snug"
                >
                  {/*
                    O PONTO DIZ SE PEGAMOS, e a cor sozinha não bastaria: quem não distingue verde de
                    cinza precisa do título. Verde é aceita, cinza é passou.
                  */}
                  <span
                    className={cn(
                      "mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                      r.aceito ? "bg-emerald-500" : "bg-muted-foreground/40",
                    )}
                    title={r.aceito ? t("spotAceita") : t("spotPassou")}
                    aria-label={r.aceito ? t("spotAceita") : t("spotPassou")}
                  />
                  <span className={cn("min-w-0 break-words", !r.aceito && "text-muted-foreground")}>
                    {r.rota}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Card>
  );
}
