"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { CreateLocationInput } from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MasterDataTable } from "@/components/master-data/master-data-table";
import { LocationForm } from "@/components/master-data/location-form";
import {
  archiveEntity,
  createEntity,
  MasterDataError,
  useEntityList,
} from "@/lib/master-data/client";
import type { LocationDto } from "@/lib/master-data/locations-service";
import type { CustomerDto } from "@/lib/master-data/customers-service";

export function LocationsClient({ canArchive }: { canArchive: boolean }) {
  const t = useTranslations("MasterData.locations");
  const tMaster = useTranslations("MasterData");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const query = useEntityList<LocationDto>("locations", { includeArchived });
  // Customer names for the table's "cliente" column (active customers).
  const customers = useEntityList<CustomerDto>("customers", {});

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["master-data", "locations"] });
  }

  function mapError(code: string | undefined): string {
    if (code === "DUPLICATE_LOCATION_CODE") return t("duplicateCode");
    return tMaster("saveError");
  }

  const customerName = useMemo(() => {
    const byId = new Map((customers.data ?? []).map((c) => [c.id, c.name]));
    return (id: string) => byId.get(id) ?? "—";
  }, [customers.data]);

  const createMutation = useMutation({
    mutationFn: (input: CreateLocationInput) => createEntity("locations", input),
    onSuccess: () => {
      setCreateOpen(false);
      setCreateError(null);
      setFeedback(t("created"));
      invalidate();
    },
    onError: (e: Error) => {
      setCreateError(mapError(e instanceof MasterDataError ? e.code : undefined));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveEntity("locations", id),
    onSuccess: () => {
      setFeedback(t("archivedMsg"));
      invalidate();
    },
    onSettled: () => setArchivingId(null),
  });

  const rows = query.data ?? [];

  /**
   * A FILA DE CLASSIFICAÇÃO (2026-08-20, a pedido): sem região E JÁ USADA em viagem aceita.
   *
   * As duas condições, e a segunda é o que faz a fila valer. Só "sem região" dava 386 estações —
   * quase todas destino de última milha ou nunca usadas — e uma fila que não zera ninguém trabalha.
   * Com o aceite junto, sobram as que a operação de fato rodou: 18 quando isto foi escrito, com uma
   * de Belo Horizonte carregando 40 viagens.
   *
   * A regra é do usuário: rota aceita é rota nossa. Proposta em análise ainda não é, e por isso não
   * entra na fila — classificar uma estação que talvez nunca seja usada é trabalho jogado fora.
   */
  const [soSemRegiao, setSoSemRegiao] = useState(false);
  const aClassificar = rows.filter((l) => !l.region && l.usedInAcceptedTrip);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = soSemRegiao ? aClassificar : rows;
    if (!term) return base;
    return base.filter(
      (l) => l.name.toLowerCase().includes(term) || l.code.toLowerCase().includes(term),
    );
  }, [rows, aClassificar, search, soSemRegiao]);

  const columns: ColumnDef<LocationDto>[] = [
    { accessorKey: "name", header: () => t("name") },
    { accessorKey: "code", header: () => t("code") },
    {
      accessorKey: "customerId",
      header: () => t("customer"),
      cell: ({ row }) => customerName(row.original.customerId),
    },
    {
      accessorKey: "city",
      header: () => t("city"),
      cell: ({ row }) => row.original.city ?? "—",
    },
    {
      accessorKey: "region",
      header: () => t("region"),
      // Sem região não é um traço como as outras células vazias: é pendência, e fica visível.
      cell: ({ row }) =>
        row.original.region ?? <span className="text-xs text-warning">{t("regionNone")}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {aClassificar.length > 0 || soSemRegiao ? (
            <Button
              variant={soSemRegiao ? "default" : "outline"}
              onClick={() => setSoSemRegiao((v) => !v)}
            >
              {t("missingRegion", { count: aClassificar.length })}
            </Button>
          ) : null}
          <Button
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            {t("new")}
          </Button>
        </div>
      </div>

      {feedback ? (
        <p role="status" className="text-sm text-muted-foreground">
          {feedback}
        </p>
      ) : null}

      <MasterDataTable
        rows={filtered}
        columns={columns}
        isLoading={query.isLoading}
        isError={query.isError}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("searchPlaceholder")}
        includeArchived={includeArchived}
        onIncludeArchivedChange={setIncludeArchived}
        detailHref={(row) => `/admin/locations/${row.id}`}
        canArchive={canArchive}
        archivingId={archivingId}
        onArchive={(row) => {
          setArchivingId(row.id);
          archiveMutation.mutate(row.id);
        }}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("create")}</DialogTitle>
            <DialogDescription>{t("subtitle")}</DialogDescription>
          </DialogHeader>
          <LocationForm
            submitting={createMutation.isPending}
            errorMessage={createError}
            submitLabel={t("create")}
            onCancel={() => setCreateOpen(false)}
            onSubmit={(values) => createMutation.mutate(values)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
