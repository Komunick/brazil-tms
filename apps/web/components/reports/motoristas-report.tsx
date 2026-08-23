"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { DesempenhoDoMotorista, DesempenhoNaRota } from "@brazil-tms/db";
import { useDesempenhoDeMotoristas } from "@/lib/trips/client";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
 * QUEM ENTREGA NO PRAZO — no geral, e em cada rota (2026-08-23, a pedido).
 *
 * A régua e o porquê de não ser a chegada na origem moram em `readDesempenhoGeral`. Aqui importa o
 * que a tela faz para o número não mentir:
 *
 *   O NÚMERO DE ENTREGAS ANDA COLADO NO PERCENTUAL, sempre. 100% em duas viagens não é melhor que
 *   86% em dezesseis, e mostrar só o percentual faz exatamente essa troca.
 *
 *   ABAIXO DE QUATRO ENTREGAS, A LINHA NÃO É RANQUEADA — ela aparece marcada como pouca amostra, e
 *   depois de todas as outras. Some seria pior: quem procura um motorista precisa saber que ele
 *   rodou a rota duas vezes, e não concluir que nunca rodou.
 *
 *   ROTA SEM HISTÓRICO DIZ QUE NÃO SABE. Um ranking que sempre tem resposta é um ranking em que não
 *   dá para confiar.
 */

/**
 * Abaixo disto a linha não é ranqueada — percentual apagado e depois das outras.
 *
 * Mora AQUI, e não no pacote de banco: é decisão de tela, e importar um VALOR de lá num componente
 * de cliente arrasta o driver do Postgres para o pacote do navegador — o build quebra pedindo `net`
 * e `tls`. Tipo se apaga na compilação e pode vir de lá; valor, não.
 */
const MINIMO_PARA_RANQUEAR = 4;

function Percentual({ pct, entregas }: { pct: number; entregas: number }) {
  const pouca = entregas < MINIMO_PARA_RANQUEAR;
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        pouca
          ? "text-muted-foreground"
          : pct >= 90
            ? "text-success"
            : pct >= 75
              ? "text-warning"
              : "text-destructive",
      )}
    >
      {pct}%
    </span>
  );
}

function LinhaDoMotorista({ d }: { d: DesempenhoDoMotorista }) {
  const t = useTranslations("Reports.motoristas");
  return (
    <>
      <TableCell>
        <span className="font-medium">{d.motorista}</span>
        {d.emViagem ? (
          <span className="ml-2 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[0.66rem] uppercase tracking-wide text-muted-foreground">
            {t("emViagem")}
          </span>
        ) : null}
      </TableCell>
      <TableCell className="text-right tabular-nums">{d.entregas}</TableCell>
      <TableCell className="text-right tabular-nums">{d.noPrazo}</TableCell>
      <TableCell className="text-right">
        <Percentual pct={d.pct} entregas={d.entregas} />
      </TableCell>
    </>
  );
}

/** A ordem do ranking: quem tem amostra primeiro, melhor percentual, e o volume desempata. */
function ordenar<T extends DesempenhoDoMotorista>(lista: T[]): T[] {
  return [...lista].sort(
    (a, b) =>
      Number(b.entregas >= MINIMO_PARA_RANQUEAR) - Number(a.entregas >= MINIMO_PARA_RANQUEAR) ||
      b.pct - a.pct ||
      b.entregas - a.entregas,
  );
}

export function MotoristasReport() {
  const t = useTranslations("Reports");
  const tM = useTranslations("Reports.motoristas");
  const query = useDesempenhoDeMotoristas();
  const [termo, setTermo] = useState("");

  const busca = termo.trim().toLowerCase();
  const geral = useMemo(() => {
    const lista = (query.data?.geral ?? []).filter(
      (d) => !busca || d.motorista.toLowerCase().includes(busca),
    );
    return ordenar(lista);
  }, [query.data, busca]);

  /** Por rota: agrupado, e cada grupo já ordenado como o ranking. */
  const rotas = useMemo(() => {
    const porRota = new Map<string, { titulo: string; linhas: DesempenhoNaRota[] }>();
    for (const d of query.data?.porRota ?? []) {
      const titulo = `${d.origem} → ${d.destino}`;
      if (busca && !`${titulo} ${d.motorista}`.toLowerCase().includes(busca)) continue;
      const atual = porRota.get(d.laneId) ?? { titulo, linhas: [] };
      atual.linhas.push(d);
      porRota.set(d.laneId, atual);
    }
    return [...porRota.values()]
      .map((g) => ({ ...g, linhas: ordenar(g.linhas) }))
      .sort(
        (a, b) => b.linhas.length - a.linhas.length || a.titulo.localeCompare(b.titulo, "pt-BR"),
      );
  }, [query.data, busca]);

  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("loadError")}
      </p>
    );
  }
  if (query.isPending) return <Skeleton className="h-72 w-full" />;

  const todas = query.data?.geral ?? [];
  const entregas = todas.reduce((n, d) => n + d.entregas, 0);
  const noPrazo = todas.reduce((n, d) => n + d.noPrazo, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Card className="p-3">
          <div className="text-2xl font-semibold leading-none tabular-nums">
            {entregas.toLocaleString("pt-BR")}
          </div>
          <div className="mt-1 text-[0.68rem] uppercase tracking-wide text-muted-foreground">
            {tM("entregasMedidas")}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-semibold leading-none tabular-nums text-success">
            {entregas === 0 ? 0 : Math.round((noPrazo / entregas) * 100)}%
          </div>
          <div className="mt-1 text-[0.68rem] uppercase tracking-wide text-muted-foreground">
            {tM("pctGeral")}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-semibold leading-none tabular-nums">{todas.length}</div>
          <div className="mt-1 text-[0.68rem] uppercase tracking-wide text-muted-foreground">
            {tM("motoristas")}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-semibold leading-none tabular-nums">
            {todas.filter((d) => d.emViagem).length}
          </div>
          <div className="mt-1 text-[0.68rem] uppercase tracking-wide text-muted-foreground">
            {tM("emViagemAgora")}
          </div>
        </Card>
      </div>

      <Input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder={tM("buscar")}
        aria-label={tM("buscar")}
        className="h-9 max-w-sm"
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{tM("geral")}</CardTitle>
          <p className="text-xs text-muted-foreground">{tM("geralAjuda")}</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tM("motorista")}</TableHead>
                <TableHead className="text-right">{tM("entregas")}</TableHead>
                <TableHead className="text-right">{tM("noPrazo")}</TableHead>
                <TableHead className="text-right">{tM("pct")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {geral.map((d) => (
                <TableRow key={d.motorista}>
                  <LinhaDoMotorista d={d} />
                </TableRow>
              ))}
              {geral.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    {tM("vazio")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{tM("porRota")}</CardTitle>
          <p className="text-xs text-muted-foreground">{tM("porRotaAjuda")}</p>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-auto">
          {rotas.map((g) => (
            <div key={g.titulo} className="space-y-1">
              <p className="font-mono text-xs text-muted-foreground">{g.titulo}</p>
              <Table>
                <TableBody>
                  {g.linhas.map((d) => (
                    <TableRow key={`${d.laneId}:${d.motorista}`}>
                      <LinhaDoMotorista d={d} />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
          {rotas.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tM("vazio")}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
