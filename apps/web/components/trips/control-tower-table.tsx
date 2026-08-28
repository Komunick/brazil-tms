"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, X } from "lucide-react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import {
  formatDateTime,
  VEHICLE_TYPE_VALUES,
  type TripBoardQuery,
  type VehicleType,
} from "@brazil-tms/shared";
import type { TripBoardRow, TripFilterOptions } from "@brazil-tms/db";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TripStatusBadge } from "@/components/trips/trip-status-badge";
import { TripFilters } from "@/components/trips/trip-filters";
import { useFilterOptions, useTripBoard, useTripBoardFilters } from "@/lib/trips/client";

/** Board `sort` values that map to a column header (R2 whitelist). */
type SortKey = TripBoardQuery["sort"];

/**
 * O nome da âncora, exportado porque quem LINKA precisa dele tanto quanto quem ancora — deixar os
 * dois lados repetirem a string é como um deles acorda quebrado sem ninguém notar.
 */
export const BOARD_ANCHOR = "viagens";

/**
 * The Control Tower board (feature 005, US1): filters + a dense server-side
 * filtered/sorted/paginated TanStack Table + a pagination footer. URL is the source of truth
 * (`useTripBoardFilters`); data freshness is TanStack Query polling (`useTripBoard`), never
 * Realtime. Each row links to the Trip Detail page. Only the five whitelisted columns are sortable;
 * later-slice dimensions (assignment → 006, SLA risk → 007, documents/billing detail → 008) are not
 * rendered as filterable/sortable columns here.
 */
export function ControlTowerTable({
  filterOptions: initialFilterOptions,
}: {
  filterOptions: TripFilterOptions;
  /** 017 — how far this user's cancel permission reaches (§18); computed server-side. */
}) {
  // 019 — keep filters + quick-assign pickers fresh on an open tab; server data seeds it.
  const filterOptions = useFilterOptions(initialFilterOptions);
  const t = useTranslations("Trips");
  const tCommon = useTranslations("Common");
  const tVehicle = useTranslations("VehicleTypes");
  const { query, search, setFilters, reset } = useTripBoardFilters();

  // The row whose cancel dialog is open (017). Same one-instance pattern.

  /** Label a (possibly unknown) vehicle-type string via the `VehicleTypes` namespace; "—" if absent. */
  function vehicleLabel(vt: string | null): string {
    if (vt && (VEHICLE_TYPE_VALUES as readonly string[]).includes(vt)) {
      return tVehicle(vt as VehicleType);
    }
    return "—";
  }
  const board = useTripBoard(search);

  /**
   * Rolar até o quadro quando se chega por um atalho do painel do dia.
   *
   * O `#viagens` no link sozinho não resolve: quando o navegador processa a âncora, o quadro ainda
   * não existe — ele nasce depois da primeira resposta da consulta. Então a rolagem espera o dado
   * chegar, acontece UMA vez (a bandeira impede que cada poll de 30s jogue a página de volta para
   * cima enquanto a pessoa lê) e respeita quem pediu menos movimento no sistema.
   */
  const jaRolou = useRef(false);
  useEffect(() => {
    if (jaRolou.current || board.isLoading) return;
    if (window.location.hash !== `#${BOARD_ANCHOR}`) return;
    jaRolou.current = true;
    const alvo = document.getElementById(BOARD_ANCHOR);
    if (!alvo) return;
    const semAnimacao = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    alvo.scrollIntoView({ behavior: semAnimacao ? "auto" : "smooth", block: "start" });
  }, [board.isLoading]);

  const items = board.data?.items ?? [];
  const total = board.data?.total ?? 0;
  const limit = query.limit;
  const offset = query.offset;

  function toggleSort(key: SortKey) {
    if (query.sort === key) {
      setFilters({ sort: key, dir: query.dir === "asc" ? "desc" : "asc" });
    } else {
      setFilters({ sort: key, dir: "asc" });
    }
  }

  /** A clickable, sortable column header with an asc/desc/neutral indicator. */
  function SortableHeader({ label, sortKey }: { label: string; sortKey: SortKey }) {
    const active = query.sort === sortKey;
    const Icon = !active ? ArrowUpDown : query.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
        onClick={() => toggleSort(sortKey)}
        aria-label={label}
      >
        {label}
        <Icon className={active ? "h-3.5 w-3.5" : "h-3.5 w-3.5 opacity-40"} aria-hidden />
      </button>
    );
  }

  const columns: ColumnDef<TripBoardRow>[] = [
    {
      id: "externalTripId",
      header: () => t("board.colExternalId"),
      cell: ({ row }) => (
        <span className="flex items-baseline gap-1.5">
          <Link
            href={`/trips/${row.original.id}`}
            className="font-medium text-primary hover:underline"
          >
            {row.original.externalTripId ?? "—"}
          </Link>
          {/**
           * A PERNA, quando a operação tem mais de uma (2026-08-28, a pedido).
           *
           * O id do cliente nomeia uma OPERAÇÃO, e ela pode ter mais de um movimento: um milk run
           * termina uma perna e sai do mesmo lugar na seguinte. Cada perna é uma viagem própria — com
           * coleta, entrega, comprovante e SLA próprios — e por isso ocupa uma LINHA a mais no quadro,
           * com a MESMA LH.
           *
           * Sem esta marca, duas linhas com o mesmo código leem como DUPLICATA. Foi exatamente a
           * conclusão a que se chegou olhando a LT0Q8R02EMW11 — e o dado estava certo o tempo todo:
           * são 48 operações assim em 4.507, todas com pernas numeradas e distintas.
           *
           * SÓ APARECE QUANDO HÁ MAIS DE UMA. Escrever "1 de 1" em 4.459 linhas para explicar 48 seria
           * pagar o ruído no lugar errado.
           *
           * E mostra "1 de 2", não só "1": sozinho, o número marcaria a segunda linha e deixaria a
           * primeira parecendo normal — o que não desfaz a leitura de duplicata, só a desloca.
           */}
          {row.original.totalDePernas > 1 ? (
            <span
              className="shrink-0 rounded bg-muted px-1 text-[0.65rem] font-medium tabular-nums text-muted-foreground"
              title={t("board.pernaTitulo")}
            >
              {t("board.perna", {
                numero: row.original.legNumber,
                total: row.original.totalDePernas,
              })}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "customerName",
      header: () => <SortableHeader label={t("board.colCustomer")} sortKey="customer" />,
      cell: ({ row }) => row.original.customerName || "—",
    },
    {
      id: "origin",
      header: () => t("board.colOrigin"),
      cell: ({ row }) => (
        <span title={row.original.originName}>{row.original.originCode || "—"}</span>
      ),
    },
    {
      id: "destination",
      header: () => t("board.colDestination"),
      cell: ({ row }) => (
        <span title={row.original.destinationName}>{row.original.destinationCode || "—"}</span>
      ),
    },
    {
      id: "laneLabel",
      header: () => t("board.colLane"),
      cell: ({ row }) => row.original.laneLabel ?? "—",
    },
    {
      id: "status",
      header: () => <SortableHeader label={t("board.colStatus")} sortKey="status" />,
      cell: ({ row }) => (
        // A aceitação vai junto: é ela que separa "Em análise" de "P/Atribuir" na mesma linha.
        <TripStatusBadge
          status={row.original.currentStatus}
          portalAcceptance={row.original.portalAcceptance}
          portalStatus={row.original.portalStatus}
        />
      ),
    },
    {
      /**
       * A REGIÃO da estação de ORIGEM, como ficha (2026-08-21, a pedido).
       *
       * Entra no lugar da coluna de risco de SLA, que saiu da tela junto com o filtro dela. A
       * pergunta que a operação faz olhando a lista passou a ser "de qual frente é esta LH?", e ela
       * não se responde pelo código da estação — quem não decorou os 78 códigos não sabe dizer.
       *
       * Estação sem região mostra um traço, não fica em branco: em branco parece coluna quebrada;
       * traço diz que a pergunta foi feita e a resposta é "ainda não classificada".
       */
      id: "region",
      header: () => t("board.colRegion"),
      cell: ({ row }) =>
        row.original.originRegion ? (
          <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
            {row.original.originRegion}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      // 006 — assignment row indicator + assigned resources (fills 005 FR-007).
      id: "assignment",
      header: () => t("board.colAssignment"),
      cell: ({ row }) => <AssignmentCell row={row.original} />,
    },
    /**
     * SEM a coluna de FATURAMENTO (2026-08-21, a pedido): a etapa está pausada, e uma coluna que
     * mostra "—" em toda linha é largura gasta. O dado continua no modelo de leitura e nas telas de
     * faturamento; voltar é reinserir estas quatro linhas.
     */
    {
      id: "plannedPickup",
      header: () => <SortableHeader label={t("board.colPickup")} sortKey="pickupStart" />,
      cell: ({ row }) => formatDateTime(row.original.plannedPickupWindowStart),
    },
    {
      id: "plannedDelivery",
      header: () => t("board.colDelivery"),
      cell: ({ row }) => formatDateTime(row.original.plannedDeliveryWindowStart),
    },
    {
      id: "plannedVehicleType",
      header: () => t("board.colVehicleType"),
      cell: ({ row }) => vehicleLabel(row.original.plannedVehicleType),
    },
    {
      id: "updatedAt",
      header: () => <SortableHeader label={t("board.colUpdatedAt")} sortKey="updatedAt" />,
      cell: ({ row }) => formatDateTime(row.original.updatedAt),
    },
  ];

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const columnCount = columns.length;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    /**
     * A âncora do quadro (2026-08-17).
     *
     * Clicar num status no painel do dia levava para cá — e para o TOPO da página, com os avisos na
     * frente. A pessoa clicava em "Em trânsito" e tinha de rolar tudo até achar as LH que pediu.
     *
     * `scroll-mt-20` existe por causa da barra de topo fixa: sem essa margem, o navegador encosta a
     * âncora no zero e a barra come as primeiras linhas.
     */
    <div id={BOARD_ANCHOR} className="scroll-mt-20 space-y-4">
      <TripFilters
        query={query}
        setFilters={setFilters}
        reset={reset}
        search={search}
        options={filterOptions}
        statusCounts={board.data?.statusCounts}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="whitespace-nowrap"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {board.isLoading ? (
              <TableRow>
                <TableCell colSpan={columnCount}>{tCommon("loading")}</TableCell>
              </TableRow>
            ) : board.isError ? (
              <TableRow>
                <TableCell colSpan={columnCount} role="alert" className="text-destructive">
                  {t("board.loadError")}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-muted-foreground">
                  {t("board.empty")}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="whitespace-nowrap">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination footer ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{t("board.paginationSummary", { from, to, total })}</span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canPrev}
            onClick={() => setFilters({ offset: String(Math.max(0, offset - limit)) })}
          >
            {t("board.previous")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canNext}
            onClick={() => setFilters({ offset: String(offset + limit) })}
          >
            {t("board.next")}
          </Button>
        </div>
      </div>

    </div>
  );
}

/**
 * A ficha de RISCO DE SLA saiu da tabela em 2026-08-21, a pedido — e o componente saiu junto, porque
 * componente sem chamador vira código que ninguém mantém e ninguém apaga.
 *
 * NADA foi desligado: `slaStatus` e `slaReasons` continuam vindo no modelo de leitura, o cálculo
 * segue rodando e o recorte rápido "Em risco" continua funcionando. O que saiu foi a coluna.
 */

/** The assignment row indicator: an assigned/unassigned icon + the assigned resource names (006). */
function AssignmentCell({ row }: { row: TripBoardRow }) {
  const t = useTranslations("Trips");
  if (!row.isAssigned) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <X className="h-3.5 w-3.5" aria-hidden />
        {t("board.assignedNo")}
      </span>
    );
  }
  const parts = [row.assignedDriverName, row.assignedVehiclePlate, row.assignedCarrierName].filter(
    (p): p is string => Boolean(p),
  );
  return (
    <span className="inline-flex items-center gap-1" title={parts.join(" · ")}>
      <Check className="h-3.5 w-3.5 text-green-600" aria-hidden />
      <span className="text-sm">
        {parts.length > 0 ? parts.join(" · ") : t("board.assignedYes")}
      </span>
    </span>
  );
}
