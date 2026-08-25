"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CorrespondenciaDaRota } from "@brazil-tms/db";
import { formatDateTime } from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";
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
import { avisar } from "@/lib/ui/avisos";
import { cn } from "@/lib/utils";

/**
 * CONFERIR AS CORRESPONDÊNCIAS ROTA → MODELO (2026-08-25, fatia 026).
 *
 * ── O QUE ESTA TELA DECIDE, E POR QUE ELA EXISTE ──────────────────────────────────────────────
 *
 * A carga casa as nossas rotas com os modelos de Pré-SM da gerenciadora por nome de estação, com
 * quatro tolerâncias que saíram de erro medido. Ela acerta 84% das viagens — e o que erra **não
 * erra em branco: erra apontando para OUTRA rota**.
 *
 * Uma Pré-SM criada com o modelo errado é escolta contratada para um trajeto que o caminhão não
 * vai fazer. Ninguém percebe até o veículo estar na estrada.
 *
 * Por isso confirmar é ato humano, e é auditado: a gerenciadora cobra por solicitação, e uma rota
 * confirmada passa a gerar Pré-SM sozinha.
 *
 * ── AS PENDENTES VÊM PRIMEIRO ─────────────────────────────────────────────────────────────────
 *
 * Elas são o trabalho; as confirmadas são histórico. Ordenar por nome misturaria as duas e faria a
 * pessoa procurar o que falta no meio do que já está feito.
 */
export function PreSmModelosClient() {
  const t = useTranslations("PreSmModelos");
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");

  const consulta = useQuery({
    queryKey: ["pre-sm-modelos"],
    queryFn: async () => {
      const res = await fetch("/api/admin/pre-sm-modelos");
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { items: CorrespondenciaDaRota[] };
    },
  });

  const definir = useMutation({
    mutationFn: async (v: { id: string; confirmar: boolean }) => {
      const res = await fetch("/api/admin/pre-sm-modelos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ["pre-sm-modelos"] });
      // O MESMO aviso do canto que toda gravação usa desde 24/08 — um padrão próprio aqui
      // obrigaria quem olha a aprender dois jeitos de o sistema dizer "deu certo".
      avisar({ tipo: "ok", texto: v.confirmar ? t("confirmada") : t("desfeita") });
    },
    onError: () => avisar({ tipo: "erro", texto: t("falhou") }),
  });

  const itens = consulta.data?.items ?? [];

  const visiveis = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    if (!termo) return itens;
    return itens.filter((i) =>
      [i.origemNorm, i.destinoNorm, i.descricao].some((c) => c.toUpperCase().includes(termo)),
    );
  }, [itens, busca]);

  const pendentes = itens.filter((i) => i.confirmadoEm == null).length;

  if (consulta.isPending) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("buscar")}
            className="max-w-xs"
          />
          {/* O número que interessa é o de PENDENTES, não o total: ele é o tamanho do trabalho. */}
          <span className="text-sm text-muted-foreground">
            {t("pendentes", { n: pendentes })} · {t("total", { n: itens.length })}
          </span>
        </CardContent>
      </Card>

      {itens.length === 0 ? (
        // Sem nenhuma linha, a tela explica o que falta acontecer — em vez de mostrar uma tabela
        // vazia que parece defeito.
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">{t("vazio")}</CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("origem")}</TableHead>
                <TableHead>{t("destino")}</TableHead>
                <TableHead>{t("modelo")}</TableHead>
                <TableHead>{t("estado")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((i) => {
                const confirmada = i.confirmadoEm != null;
                return (
                  <TableRow key={i.id} className={cn(!confirmada && "bg-warning/5")}>
                    <TableCell className="font-medium">{i.origemNorm}</TableCell>
                    <TableCell className="font-medium">{i.destinoNorm}</TableCell>
                    {/* A descrição é como ELA escreve a rota. É o que a pessoa compara com as duas
                        colunas à esquerda para decidir se o casamento está certo — sem ela, a
                        conferência seria aprovar um número. */}
                    <TableCell>
                      <span className="text-muted-foreground">{i.codModelo}</span>{" "}
                      <span>{i.descricao}</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {confirmada ? (
                        <span className="text-success">
                          {t("confirmadaEm", { data: formatDateTime(i.confirmadoEm) })}
                        </span>
                      ) : (
                        <span className="text-warning">{t("aguardando")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant={confirmada ? "ghost" : "default"}
                        disabled={definir.isPending}
                        onClick={() => definir.mutate({ id: i.id, confirmar: !confirmada })}
                      >
                        {confirmada ? t("desfazer") : t("confirmar")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
