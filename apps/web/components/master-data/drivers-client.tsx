"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { CreateDriverInput } from "@brazil-tms/shared";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExpiryCell } from "@/components/master-data/expiry-cell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MasterDataTable } from "@/components/master-data/master-data-table";
import { DriverForm } from "@/components/master-data/driver-form";
import {
  archiveEntity,
  createEntity,
  MasterDataError,
  useEntityList,
} from "@/lib/master-data/client";
import { normalizeForSearch } from "@/lib/search-normalize";
import type { DriverDto } from "@/lib/master-data/drivers-service";

export function DriversClient({ canArchive }: { canArchive: boolean }) {
  const t = useTranslations("Resources.drivers");
  const tResources = useTranslations("Resources");
  const tStatus = useTranslations("ResourceStatus");
  const tMaster = useTranslations("MasterData");
  const queryClient = useQueryClient();

  /**
   * QUAL ABA — todos ou só os bloqueados (2026-08-25, a pedido).
   *
   * Filtro sobre a mesma lista, e não uma consulta separada: o bloqueio já vem no DTO, e uma
   * segunda rota teria o seu próprio momento de carregamento — a aba pareceria vazia por um
   * instante toda vez, que é exatamente o que faz alguém achar que perdeu um cadastro.
   */
  const [aba, setAba] = useState<"todos" | "bloqueados">("todos");
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const query = useEntityList<DriverDto>("drivers", { includeArchived });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["master-data", "drivers"] });
  }

  function mapError(code: string | undefined): string {
    if (code === "OWNERSHIP_CARRIER_MISMATCH") return tResources("ownershipCarrierMismatch");
    return tMaster("saveError");
  }

  const createMutation = useMutation({
    mutationFn: (input: CreateDriverInput) => createEntity("drivers", input),
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
    mutationFn: (id: string) => archiveEntity("drivers", id),
    onSuccess: () => {
      setFeedback(t("archivedMsg"));
      invalidate();
    },
    onSettled: () => setArchivingId(null),
  });

  const rows = query.data ?? [];
  const filtered = useMemo(() => {
    // Name matches accent-insensitively; the phone is stored as bare digits, so the typed term is
    // compared by ITS digits — "(11) 99999" still finds 11999998888.
    const base = aba === "bloqueados" ? rows.filter((d) => d.blockedAt != null) : rows;
    const term = normalizeForSearch(search);
    if (!term) return base;
    const digits = normalizeForSearch(search, "digits");
    return base.filter(
      (d) =>
        normalizeForSearch(d.name).includes(term) ||
        (digits.length > 0 && (d.phone ?? "").includes(digits)),
    );
  }, [rows, search, aba]);

  const bloqueados = rows.filter((d) => d.blockedAt != null).length;

  const columns: ColumnDef<DriverDto>[] = [
    { accessorKey: "name", header: () => t("name") },
    {
      accessorKey: "phone",
      header: () => t("phone"),
      cell: ({ row }) => row.original.phone ?? "—",
    },
    {
      id: "_opStatus",
      header: () => tResources("status"),
      // O bloqueio ganha do status operacional na coluna: é a informação que muda o que dá para
      // fazer com a pessoa. Mostrar "Ativo" para quem está bloqueado seria dizer o contrário do
      // que vale.
      cell: ({ row }) =>
        row.original.blockedAt ? (
          <Badge variant="destructive">{t("block.badge")}</Badge>
        ) : (
          <Badge variant="secondary">{tStatus(row.original.status)}</Badge>
        ),
    },
    {
      id: "_expiry",
      header: () => t("licenseExpiry"),
      // 020 (issue #27) — the date itself + warning/expired states; null reads "Não informada".
      cell: ({ row }) => (
        <ExpiryCell date={row.original.licenseExpiry} state={row.original.documentExpiryState} />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          onClick={() => {
            setCreateError(null);
            setCreateOpen(true);
          }}
        >
          {t("new")}
        </Button>
      </div>

      {feedback ? (
        <p role="status" className="text-sm text-muted-foreground">
          {feedback}
        </p>
      ) : null}

      {/* O número na aba é o tamanho do problema. Sem ele, saber se há alguém bloqueado exigiria
          clicar — e ninguém clica numa aba que parece vazia. */}
      <Tabs value={aba} onValueChange={(v) => setAba(v as "todos" | "bloqueados")}>
        <TabsList>
          <TabsTrigger value="todos">{t("block.abaTodos")}</TabsTrigger>
          <TabsTrigger value="bloqueados">
            {t("block.abaBloqueados", { n: bloqueados })}
          </TabsTrigger>
        </TabsList>
      </Tabs>

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
        detailHref={(row) => `/resources/drivers/${row.id}`}
        canArchive={canArchive}
        archivingId={archivingId}
        onArchive={(row) => {
          setArchivingId(row.id);
          archiveMutation.mutate(row.id);
        }}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        {/* Issue #31 [0008]: larger registration window than the base max-w-lg. */}
        <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("create")}</DialogTitle>
            <DialogDescription>{t("subtitle")}</DialogDescription>
          </DialogHeader>
          <DriverForm
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
