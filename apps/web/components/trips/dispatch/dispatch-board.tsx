"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ACEITACAO_PENDENTE, formatDateTime, saoPauloDate } from "@brazil-tms/shared";
import type { TripBoardRow, TripFilterOptions } from "@brazil-tms/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AssignmentForm } from "@/components/trips/dispatch/assignment-form";
import { CancelTripDialog } from "@/components/trips/cancel-trip-dialog";
import { PortalDecisionButtons } from "@/components/trips/portal-decision-buttons";
import { canCancelTrip, type CancelScope } from "@/lib/trips/cancel-scope";
import { useFilterOptions, useTripBoard } from "@/lib/trips/client";

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
 * 017 (issue #24): each row also offers "Cancelar viagem" for `cancelScope` holders (the queue is all
 * `received` ⊂ dispatch phase, so any non-`none` scope qualifies) — the shared CancelTripDialog; a
 * cancelled trip leaves the queue on the next poll/invalidation.
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
const DISPATCH_QUERY = "assigned=false&status=received&sort=pickupStart";

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

export function DispatchBoard({
  resourceOptions: initialResourceOptions,
  cancelScope = "none",
}: {
  resourceOptions: TripFilterOptions;
  /** 017 — how far this user's cancel permission reaches (§18); computed server-side. */
  cancelScope?: CancelScope;
}) {
  // 019 — keep the assign pickers fresh on an open tab (60s poll + focus refetch); server seed.
  const resourceOptions = useFilterOptions(initialResourceOptions);
  const t = useTranslations("Dispatch");
  const tCancel = useTranslations("Trips.cancel");
  const tCommon = useTranslations("Common");
  // The queue reuses the Control Tower's pagination wording — same board, same vocabulary.
  const tBoard = useTranslations("Trips.board");

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
  const [pickupFrom, setPickupFrom] = useState(() => saoPauloDate());
  const [pickupTo, setPickupTo] = useState("");

  /**
   * O RECORTE DA FILA — e por que ele precisou existir no mesmo dia (2026-08-21).
   *
   * A fila tem 376 linhas e SETE delas esperam decisão. Os botões de Aceitar/Recusar entraram na
   * linha certa e mesmo assim ninguém os encontrava: sete agulhas ordenadas por data no meio de
   * trezentas e setenta e seis. Foi exatamente o relato — "não estou vendo aceitar nenhum".
   *
   * Uma ação que existe e não pode ser encontrada não existe. Os dois recortes são as duas perguntas
   * que a operação faz nesta tela, e agora dá para escolher qual está sendo respondida.
   */
  const [recorte, setRecorte] = useState<"todas" | "in_analysis" | "to_assign">("todas");

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
    DISPATCH_QUERY,
    recorte === "todas" ? "" : `queue=${recorte}`,
    appliedSearch ? `q=${encodeURIComponent(appliedSearch)}` : "",
    pickupFrom ? `pickupFrom=${pickupFrom}` : "",
    pickupTo ? `pickupTo=${pickupTo}` : "",
    `limit=${PAGE_SIZE}`,
    `offset=${offset}`,
  ]
    .filter(Boolean)
    .join("&");
  const board = useTripBoard(query);

  // The trip whose assign dialog is open.
  const [assignRow, setAssignRow] = useState<TripBoardRow | null>(null);
  // The trip whose cancel dialog is open (017).
  const [cancelRow, setCancelRow] = useState<TripBoardRow | null>(null);

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
         * As fichas do RECORTE vêm antes das de data: elas dizem QUE trabalho está sendo feito, e a
         * data só limita quando. Trocar de recorte volta para a primeira página — a paginação é do
         * conjunto anterior e continuar nela mostraria um pedaço do meio de outra lista.
         */}
        <div className="flex flex-wrap gap-1.5">
          {(["todas", "in_analysis", "to_assign"] as const).map((chave) => (
            <Button
              key={chave}
              type="button"
              size="sm"
              variant={recorte === chave ? "default" : "outline"}
              onClick={() => {
                setRecorte(chave);
                setOffset(0);
                /**
                 * ESCOLHER "aguardando decisão" SOLTA O FILTRO DE DATA.
                 *
                 * A fila abre em "de hoje em diante", e cinco das sete pendentes de hoje têm coleta
                 * no PASSADO — ficariam escondidas justamente por serem as mais atrasadas. Prazo
                 * vencido não é motivo para sumir da tela; é motivo para aparecer primeiro.
                 *
                 * Só neste sentido: voltar para "todas" não repõe a data, porque aí o volume é de
                 * centenas e o recorte de data é o que torna a lista utilizável.
                 */
                if (chave === "in_analysis") {
                  setPickupFrom("");
                  setPickupTo("");
                }
              }}
            >
              {t(`queueFilter.${chave}`)}
            </Button>
          ))}
        </div>

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
          <ul className="space-y-3">
            {items.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"
              >
                <div className="space-y-1">
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
                </div>
                <div className="flex gap-2">
                  {canCancelTrip(cancelScope, row.currentStatus) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => setCancelRow(row)}
                    >
                      {tCancel("action")}
                    </Button>
                  ) : null}
                  {row.portalAcceptance === ACEITACAO_PENDENTE ? (
                    <PortalDecisionButtons
                      tripId={row.id}
                      externalTripId={row.externalTripId}
                      tamanho="sm"
                    />
                  ) : (
                    <Button type="button" size="sm" onClick={() => setAssignRow(row)}>
                      {t("assignAction")}
                    </Button>
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

      {/* Assign dialog — the shared AssignmentForm for the queued trip (one write path, FR-022). */}
      <Dialog open={assignRow != null} onOpenChange={(open) => !open && setAssignRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("openAssign")}
              {assignRow?.externalTripId ? ` — ${assignRow.externalTripId}` : ""}
            </DialogTitle>
          </DialogHeader>
          {assignRow ? (
            <AssignmentForm
              tripId={assignRow.id}
              currentStatus={assignRow.currentStatus}
              currentAssignment={null}
              resourceOptions={resourceOptions}
              onDone={() => setAssignRow(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Cancel dialog (017) — the shared justified flow; one instance fed the row in scope. */}
      {cancelRow ? (
        <CancelTripDialog
          tripId={cancelRow.id}
          tripLabel={cancelRow.externalTripId}
          open
          onOpenChange={(open) => !open && setCancelRow(null)}
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
