"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ACEITACAO_PENDENTE,
  formatDateTime,
  saoPauloDate,
  type VehicleType,
} from "@brazil-tms/shared";
import type { TripBoardRow } from "@brazil-tms/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalDecisionButtons } from "@/components/trips/portal-decision-buttons";
import { PortalAssignDialog } from "@/components/trips/portal-assign-dialog";
import { PortalOrderStatus } from "@/components/trips/portal-order-status";
import { useTripBoard } from "@/lib/trips/client";

/**
 * The Dispatch Board (006 US5, §15.6): the dispatcher's daily workspace — the unassigned-by-pickup
 * queue with an inline assign action per trip. It reads the SAME extended board the Control Tower
 * uses, pinned to `assigned=false&status=received&sort=pickupStart`, so resource availability and
 * conflict state reflect the latest poll (30s, built into `useTripBoard` — NO Realtime). Assigning
 * uses the SAME shared `AssignmentForm` (one write path, FR-022); the form surfaces server-authoritative
 * findings as the dispatcher picks. Focused queue — availability is the trip's pickup ordering plus the
 * form's live conflict check, not a separate resource-calendar widget (kept minimal per the brief).
 *
 * Slice 015 (FR-006): the queue is narrowed to `status=received` (a non-empty status suppresses the
 * `scope=active` default in `buildWhere`) so it lists ONLY unassigned `received` trips — every "Atribuir"
 * it offers can succeed (`received → assigned`). The validation states were collapsed into `received`,
 * which is now the first dispatchable status (slice 015 superseded slice 014's `status=validated` queue).
 *
 * Queue search + pickup-date range: a debounced box feeds the board's own server-side `q` (external
 * trip id, customer, origin/destination — same matching the Control Tower uses) and two date inputs
 * feed `pickupFrom`/`pickupTo`; presets ("Hoje", "Próximos 7 dias", "De hoje em diante", "Tudo") just
 * set those inputs. Everything is ANDed with the pinned queue filters, so no filter can widen the
 * queue beyond unassigned `received` trips. The board OPENS on "de hoje em diante": the queue sorts
 * by pickup ASC, so an unbounded first page would open on the oldest rows of a bulk-imported season.
 * The queue pages server-side (50/page) with the Control Tower's wording, and any filter change resets
 * to page 1. The control sits at BOTH ends — pinned above the list and repeated after the last row —
 * and turning a page scrolls back to the first row of the new one: with it only at the far end, a page
 * turn cost a scroll down and a scroll back up to read the result.
 *
 * O "Cancelar viagem" saiu da linha em 2026-08-21, a pedido — e do TMS inteiro junto. Quem cancela
 * uma viagem é o CLIENTE, no portal dele; o robô traz o cancelamento na leitura seguinte. A rota e o
 * diálogo continuam existindo, sem entrada na tela — repor é uma linha, se um dia fizer sentido.
 */

/**
 * A FILA DE DESPACHO TEM AS DUAS FILAS, E CADA LINHA OFERECE O QUE CABE NELA (2026-08-21, a pedido).
 *
 * `received` guarda duas coisas que pedem ações diferentes: as que esperam o cliente responder
 * ("Em análise") e as que esperam motorista ("P/Atribuir"). A primeira versão de hoje tirou as em
 * análise daqui; o usuário pediu o contrário — que elas fiquem, com Aceitar e Recusar no lugar do
 * Atribuir.
 *
 * É a leitura certa da operação: a fila de expedição é onde se trabalha o que ainda não rodou, e a
 * ordem dentro dela é aceitar primeiro, escalar depois. Duas telas para as duas metades obrigariam
 * a pessoa a lembrar em qual delas está o que ela procura.
 *
 * O que NÃO se faz é oferecer Atribuir numa proposta: escalar motorista para um trabalho que a
 * empresa ainda pode recusar é comprometer recurso à toa. Quem decide isso é a linha, pelo estado
 * de aceitação dela.
 */
/**
 * A FILA NÃO EXCLUI MAIS AS JÁ ATRIBUÍDAS (2026-08-22, a pedido).
 *
 * `assigned=false` fazia sentido quando a fila só servia para escalar recurso do TMS: atribuído é
 * trabalho feito, sai da lista. Mas a atribuição que vai ao PORTAL é editável — lá o botão se chama
 * "Atribuir/editar" e leva ao mesmo lugar, porque trocar quem dirige é corriqueiro: motorista passou
 * mal, veículo quebrou.
 *
 * Com o filtro, a LH sumia da tela no instante em que ganhava motorista, e não havia de onde
 * corrigi-la. A linha agora mostra quem está escalado, e o botão vira "Editar no portal".
 *
 * ── E `assigned` TAMBÉM É DA FILA (2026-08-22, segunda passada) ────────────────────────────────
 *
 * Tirar `assigned=false` não bastou, e a primeira versão disto não consertou nada: viagem que ganha
 * motorista no portal muda de STATUS para `assigned` aqui, e a fila pedia `status=received`. Medido
 * em produção: das 41 viagens `assigned` dos últimos dois dias, as 41 têm motorista do portal — ou
 * seja, exatamente as que o usuário queria editar eram exatamente as que a consulta excluía.
 *
 * A fila são os DOIS estados anteriores ao caminhão andar. De `at_origin` em diante a viagem está
 * em execução, e trocar quem dirige ali não é edição de escala, é ocorrência — outro assunto.
 *
 * ── E A ABA DEIXA DE PEDIR `queue=to_assign` ───────────────────────────────────────────────────
 *
 * Faltava o principal: `to_assign` quer dizer, textualmente, "aceita e AINDA SEM motorista" — a
 * viagem escalada no portal cai em `awaiting_arrival` e nunca apareceria aqui, por mais que o
 * status batesse. Era essa a razão de o "Editar" não ter mudado nada na prática.
 *
 * A aba pergunta agora pelo eixo que de fato governa quem pode ser escalado — a ACEITAÇÃO — e
 * ignora o motorista. As fichas do quadro continuam com as três filas exclusivas de sempre.
 */
const FILA_ATRIBUIR = "status=received&status=assigned&portalAccepted=true";

/** A aba de análise continua sendo a fila exclusiva de sempre: proposta que ninguém decidiu. */
const FILA_ANALISE = "queue=in_analysis";

/** How long the queue search waits after the last keystroke before hitting the board endpoint. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Pickup-date presets. The queue is sorted by pickup ASC, so with no date bound page 1 shows the
 * OLDEST rows in the queue — for a customer that imports a whole season at once, that is a wall of
 * trips nobody can act on. The board therefore opens on "de hoje em diante"; "Tudo" clears it.
 */
const DATE_PRESETS = [
  { key: "today", from: () => saoPauloDate(), to: () => saoPauloDate() },
  { key: "next7", from: () => saoPauloDate(), to: () => saoPauloDate(7) },
  { key: "fromToday", from: () => saoPauloDate(), to: () => "" },
  { key: "all", from: () => "", to: () => "" },
] as const;

type DatePresetKey = (typeof DATE_PRESETS)[number]["key"];

/** Rows per page. Sent explicitly so the footer's arithmetic can never drift from the server's. */
const PAGE_SIZE = 50;

export function DispatchBoard() {
  const t = useTranslations("Dispatch");
  const tCommon = useTranslations("Common");
  // The queue reuses the Control Tower's pagination wording — same board, same vocabulary.
  const tBoard = useTranslations("Trips.board");
  const tPortal = useTranslations("Trips.portalAssign");

  // Queue search: what the user is typing, and the debounced term actually sent as `q` (the board's
  // server-side search — external trip id, customer, origin/destination). Debounced so a typed id
  // costs one request, not one per keystroke; the 30s poll keeps running on the filtered query.
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Pickup-date bounds, typed directly or set by a preset. Both are `yyyy-MM-dd` in São Paulo and go
  // to the board's own `pickupFrom`/`pickupTo` (the server maps them to BRT day boundaries).
  /**
   * A ABA DE DECISÃO ABRE SEM FILTRO DE DATA, a de atribuição abre em "de hoje em diante".
   *
   * São doze pendências, não trezentas: não há volume a recortar, e cinco das sete de hoje têm coleta
   * VENCIDA — abrir filtrado esconderia justamente as mais atrasadas. Na de atribuição o volume é de
   * centenas e a data é o que torna a lista utilizável.
   */
  const [pickupFrom, setPickupFrom] = useState("");
  const [pickupTo, setPickupTo] = useState("");

  /**
   * DUAS ABAS, E NENHUMA VISÃO MISTA (2026-08-21, a pedido — "está embaralhado aí").
   *
   * A fila tinha 376 linhas com "Atribuir" e SETE esperando decisão no meio delas. Primeiro tentei
   * resolver com um filtro e uma opção "Todas"; o usuário viu antes de mim que o problema não era
   * achar, era MISTURAR. São dois trabalhos diferentes, feitos por quem está pensando em coisas
   * diferentes — decidir se a empresa faz a viagem, e escolher quem a faz.
   *
   * Por isso não existe mais visão mista: ou você está decidindo, ou está escalando. A aba de
   * decisão abre primeiro porque é ela que trava a outra — não se escala o que não foi aceito.
   */
  const [aba, setAba] = useState<"in_analysis" | "to_assign">("in_analysis");
  /**
   * GERAL × NOSSAS ROTAS (2026-08-23, a pedido) — e só na fila de aceite.
   *
   * É ali que a mistura existe: o portal oferece à transportadora tanto as viagens que já são
   * dela quanto as que ainda não têm dono, e no dia em que isto foi escrito 40 das 41 propostas
   * vencidas eram de rota que a empresa nunca rodou. Na aba de atribuir a pergunta não se
   * coloca: não existe viagem para escalar que não seja nossa — se ela chegou lá, foi aceita.
   *
   * NASCE EM "NOSSAS ROTAS" porque é a lista de trabalho; Geral fica a um clique, ao lado, com
   * o rótulo à vista. Esconder por padrão só é honesto quando o caminho de volta está na mesma
   * linha do olho — e está.
   */
  const [soNossas, setSoNossas] = useState(true);

  function applyPreset(key: DatePresetKey): void {
    const preset = DATE_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setPickupFrom(preset.from());
    setPickupTo(preset.to());
  }
  const activePreset = DATE_PRESETS.find(
    (p) => p.from() === pickupFrom && p.to() === pickupTo,
  )?.key;
  const dateFilterActive = pickupFrom !== "" || pickupTo !== "";

  // Paging. Any filter change resets to the first page — otherwise a narrowed queue can leave you
  // stranded on an offset past its new end, staring at an empty list that looks like "no trips".
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    setOffset(0);
  }, [appliedSearch, pickupFrom, pickupTo]);

  /**
   * Turning a page puts you at the START of the new one. Paging from the top control used to leave
   * the viewport wherever it was — halfway down a list whose contents had silently changed under it.
   * `smooth` is skipped for users who asked for less motion.
   */
  const listTopRef = useRef<HTMLDivElement>(null);
  function goToOffset(next: number): void {
    setOffset(next);
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    listTopRef.current?.scrollIntoView({
      block: "start",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  const query = [
    aba === "in_analysis" ? FILA_ANALISE : FILA_ATRIBUIR,
    aba === "in_analysis" && soNossas ? "rotaNossa=true" : "",
    "sort=pickupStart",
    appliedSearch ? `q=${encodeURIComponent(appliedSearch)}` : "",
    pickupFrom ? `pickupFrom=${pickupFrom}` : "",
    pickupTo ? `pickupTo=${pickupTo}` : "",
    `limit=${PAGE_SIZE}`,
    `offset=${offset}`,
  ]
    .filter(Boolean)
    .join("&");
  const board = useTripBoard(query);

  /** A viagem cujo formulário de atribuição NO PORTAL está aberto. */
  const [portalRow, setPortalRow] = useState<TripBoardRow | null>(null);
  /**
   * As viagens cuja ordem acabou de sair daqui, para a linha acompanhar o que o portal responde.
   *
   * Um conjunto e não um id só: dá tempo de mandar a segunda antes de a primeira fechar, e nesse
   * caso as duas precisam continuar contando o que aconteceu. Ele não é limpo — a linha some da
   * lista quando o robô leitor traz o estado novo, e leva o acompanhamento junto.
   */
  const [emVoo, setEmVoo] = useState<ReadonlySet<string>>(() => new Set());
  // The trip whose cancel dialog is open (017).

  const items = board.data?.items ?? [];
  const total = board.data?.total ?? 0;
  const firstShown = total === 0 ? 0 : offset + 1;
  const lastShown = Math.min(offset + PAGE_SIZE, total);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("queueTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <Input
              id="dispatch-search"
              type="search"
              placeholder={t("searchPlaceholder")}
              aria-label={tCommon("search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dispatch-pickup-from" className="text-xs text-muted-foreground">
              {t("pickupFrom")}
            </Label>
            <Input
              id="dispatch-pickup-from"
              type="date"
              className="w-[10.5rem]"
              value={pickupFrom}
              onChange={(event) => setPickupFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dispatch-pickup-to" className="text-xs text-muted-foreground">
              {t("pickupTo")}
            </Label>
            <Input
              id="dispatch-pickup-to"
              type="date"
              className="w-[10.5rem]"
              value={pickupTo}
              onChange={(event) => setPickupTo(event.target.value)}
            />
          </div>
        </div>

        {/**
         * A faixa de abas, e não fichas soltas: uma aba diz que a lista embaixo dela É outra coisa,
         * uma ficha sugere que é a mesma lista filtrada. Aqui são dois trabalhos, não dois recortes.
         *
         * Trocar de aba volta para a primeira página e repõe a data que faz sentido para o trabalho
         * daquela aba — continuar na página 7 de outra lista mostraria um pedaço do meio do nada.
         */}
        <div className="flex gap-1 border-b">
          {(["in_analysis", "to_assign"] as const).map((chave) => (
            <button
              key={chave}
              type="button"
              aria-current={aba === chave ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                aba === chave
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => {
                setAba(chave);
                setOffset(0);
                setPickupFrom(chave === "to_assign" ? saoPauloDate() : "");
                setPickupTo("");
              }}
            >
              {t(`queueTab.${chave}`)}
            </button>
          ))}
        </div>

        {/* O recorte da malha, só onde ele significa alguma coisa. Ver `soNossas`. */}
        {aba === "in_analysis" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { valor: true, rotulo: t("malha.nossas") },
                { valor: false, rotulo: t("malha.geral") },
              ] as const
            ).map((op) => (
              <button
                key={String(op.valor)}
                type="button"
                aria-pressed={soNossas === op.valor}
                onClick={() => {
                  setSoNossas(op.valor);
                  setOffset(0);
                }}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  soNossas === op.valor
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {op.rotulo}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              type="button"
              size="sm"
              variant={activePreset === preset.key ? "default" : "outline"}
              onClick={() => applyPreset(preset.key)}
            >
              {t(`datePreset.${preset.key}`)}
            </Button>
          ))}
        </div>

        {/* Paging bar, pinned. The queue runs to hundreds of trips, and with the control only at the
            far end, turning a page meant scrolling to the bottom and back up to read the new one.
            Sticking it above the list keeps it a click away wherever you are; the twin at the bottom
            stays for whoever reads to the end. */}
        {total > 0 ? (
          <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 border-b bg-card px-1 py-2 text-sm text-muted-foreground">
            <span>{tBoard("paginationSummary", { from: firstShown, to: lastShown, total })}</span>
            <PageControls
              offset={offset}
              total={total}
              onChange={goToOffset}
              labels={{ previous: tBoard("previous"), next: tBoard("next") }}
            />
          </div>
        ) : null}

        <div ref={listTopRef} className="scroll-mt-4" />

        {board.isLoading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : board.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t("boardLoadError")}
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {appliedSearch
              ? t("searchEmpty", { term: appliedSearch })
              : dateFilterActive
                ? t("dateEmpty")
                : t("boardEmpty")}
          </p>
        ) : (
          // A LISTA TEM LARGURA MÁXIMA (2026-08-22, a pedido). Cada linha ocupava a tela inteira,
          // com o texto à esquerda e os botões colados na borda direita: num monitor largo, mais de
          // mil pixels entre ler a LH e clicar em Aceitar, dezenas de vezes por hora. Com o teto os
          // dois ficam a uma distância que a vista alcança sem varrer a tela — e as linhas ficaram
          // mais baixas, que é o outro lado da queixa: cabe mais fila na mesma altura.
          <ul className="max-w-4xl space-y-2">
            {items.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0 space-y-0.5">
                  <Link
                    href={`/trips/${row.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {row.externalTripId ?? t("noExternalId")}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {row.customerName} · {row.originCode || "—"} → {row.destinationCode || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("pickup")}: {formatDateTime(row.plannedPickupWindowStart)}
                  </p>
                  {/**
                   * QUEM JÁ ESTÁ ESCALADO, na própria linha (2026-08-22).
                   *
                   * Sem isto a fila mistura, sem nenhum sinal visível, o que falta escalar com o que
                   * já está escalado — e a única pista era a palavra do botão, do outro lado da
                   * linha. O usuário abriu a aba, viu a lista de sempre e concluiu, com razão, que
                   * as atribuídas continuavam de fora.
                   *
                   * Vem do PORTAL, não da atribuição do TMS: é o que o cliente enxerga, e é o que
                   * o botão ao lado vai editar.
                   */}
                  {emVoo.has(row.id) ? <PortalOrderStatus tripId={row.id} /> : null}
                  {row.portalDriverName ? (
                    <p className="text-xs font-medium text-foreground">
                      {tPortal("assignedTo")}: {row.portalDriverName}
                      {row.portalPlate ? ` · ${row.portalPlate}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {row.portalAcceptance === ACEITACAO_PENDENTE ? (
                    <PortalDecisionButtons
                      tripId={row.id}
                      externalTripId={row.externalTripId}
                      tamanho="sm"
                    />
                  ) : (
                    <>
                      {/**
                       * UM BOTÃO SÓ (2026-08-22, a pedido).
                       *
                       * Eram dois, lado a lado, os dois escritos "Atribuir": este, que vai ao
                       * portal, e a escala interna do TMS, que não vai. O usuário apertou o de
                       * dentro, confirmou, foi conferir no portal e não achou nada — porque nada
                       * tinha ido. A fila de ordens estava vazia, e estava certa.
                       *
                       * A escala interna não some por ser confusa; some por não servir a ninguém:
                       * das 2.790 atribuições vigentes em produção, 2.790 foram do robô leitor e
                       * NENHUMA de uma pessoa. Quem preenche aquilo é a leitura do portal.
                       */}
                      <Button type="button" size="sm" onClick={() => setPortalRow(row)}>
                        {row.isAssigned ? tPortal("actionEdit") : tPortal("action")}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Pagination footer — same shape and wording as the Control Tower board. */}
        {total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm text-muted-foreground">
            <span>{tBoard("paginationSummary", { from: firstShown, to: lastShown, total })}</span>
            <PageControls
              offset={offset}
              total={total}
              onChange={goToOffset}
              labels={{ previous: tBoard("previous"), next: tBoard("next") }}
            />
          </div>
        ) : null}
      </CardContent>

      {portalRow ? (
        <PortalAssignDialog
          /* Trocar de viagem MONTA outro diálogo: é o que garante o formulário limpo, sem efeito. */
          key={portalRow.id}
          tripId={portalRow.id}
          externalTripId={portalRow.externalTripId}
          vehicleType={(portalRow.plannedVehicleType as VehicleType | null) ?? null}
          driverAtual={portalRow.portalDriverId}
          placaAtual={portalRow.portalPlate}
          onSent={() => setEmVoo((atual) => new Set(atual).add(portalRow.id))}
          open
          onOpenChange={(aberto) => !aberto && setPortalRow(null)}
        />
      ) : null}
    </Card>
  );
}

/**
 * Previous / next, rendered at BOTH ends of the queue (pinned above it and after the last row) so a
 * page turn never costs a scroll. Local to this file on purpose: it is two usages of one control,
 * not a shared abstraction (PRINCIPLES — the ≥3 rule).
 */
function PageControls({
  offset,
  total,
  onChange,
  labels,
}: {
  offset: number;
  total: number;
  onChange: (next: number) => void;
  labels: { previous: string; next: string };
}) {
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - PAGE_SIZE))}
      >
        {labels.previous}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={offset + PAGE_SIZE >= total}
        onClick={() => onChange(offset + PAGE_SIZE)}
      >
        {labels.next}
      </Button>
    </div>
  );
}
