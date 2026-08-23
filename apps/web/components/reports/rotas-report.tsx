"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { REGION_ORDER } from "@brazil-tms/shared";
import type { RotaDaMalha } from "@brazil-tms/db";
import { useMalhaDeRotas } from "@/lib/trips/client";
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
 * A MALHA — quais rotas são nossas (2026-08-23, a pedido).
 *
 * A regra e o porquê de ela ser CALCULADA e não cadastrada moram em `readMalhaDeRotas`. Aqui só
 * importa o que a tela faz com isso, e são duas coisas:
 *
 *   AS DUAS TABELAS SÃO O CONTEÚDO. "Já rodamos" é a malha com prova, para conferir contra a
 *   planilha da operação. "Nunca rodamos" é o balde onde convivem a oferta que não é nossa e a
 *   ROTA NOVA — e separar as duas é trabalho de gente, não de consulta. Por isso a segunda tabela
 *   tem o mesmo peso visual da primeira: ela é a razão de esta tela existir.
 *
 *   O RECORTE É LOCAL. Busca e frente filtram as ~156 linhas em memória. Ir ao servidor a cada
 *   tecla para reduzir uma tabela que já chegou inteira seria trabalho para piorar a resposta.
 */

const SEM_FRENTE = "__sem__";

function Numero({ valor, rotulo, cor }: { valor: string; rotulo: string; cor?: string }) {
  return (
    <Card className="p-3">
      <div className={cn("text-2xl font-semibold leading-none tabular-nums", cor)}>{valor}</div>
      <div className="mt-1 text-[0.68rem] uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </div>
    </Card>
  );
}

/** A rota em uma linha: as duas pontas em fonte de código, porque são códigos de estação. */
function Rota({ rota }: { rota: RotaDaMalha }) {
  return (
    <span className="font-mono text-xs">
      {rota.origem}
      <span className="px-1 text-muted-foreground">→</span>
      {rota.destino}
    </span>
  );
}

function Frente({ region }: { region: string | null }) {
  const t = useTranslations("Reports.rotas");
  return (
    <span className="whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.68rem] uppercase tracking-wide text-muted-foreground">
      {region ?? t("semFrente")}
    </span>
  );
}

export function RotasReport() {
  const t = useTranslations("Reports");
  const tR = useTranslations("Reports.rotas");
  const query = useMalhaDeRotas();
  const [termo, setTermo] = useState("");
  const [frente, setFrente] = useState<string>("");

  const rotas = useMemo(() => query.data?.rotas ?? [], [query.data]);

  const visiveis = useMemo(() => {
    const busca = termo.trim().toLowerCase();
    return rotas.filter((r) => {
      if (frente === SEM_FRENTE && r.region) return false;
      if (frente && frente !== SEM_FRENTE && r.region !== frente) return false;
      if (busca && !`${r.origem} ${r.destino}`.toLowerCase().includes(busca)) return false;
      return true;
    });
  }, [rotas, termo, frente]);

  const rodadas = visiveis.filter((r) => r.rodadas > 0);
  const nunca = visiveis.filter((r) => r.rodadas === 0);
  const viagensRodadas = rotas.reduce((n, r) => n + r.rodadas, 0);

  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("loadError")}
      </p>
    );
  }
  if (query.isPending) return <Skeleton className="h-72 w-full" />;

  const filtros: { valor: string; rotulo: string }[] = [
    { valor: "", rotulo: tR("todas") },
    ...REGION_ORDER.map((r) => ({ valor: r, rotulo: r })),
    { valor: SEM_FRENTE, rotulo: tR("semFrente") },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Numero
          valor={String(rotas.filter((r) => r.rodadas > 0).length)}
          rotulo={tR("paresRodados")}
          cor="text-success"
        />
        <Numero
          valor={String(rotas.filter((r) => r.rodadas === 0).length)}
          rotulo={tR("paresNunca")}
          cor="text-warning"
        />
        <Numero valor={viagensRodadas.toLocaleString("pt-BR")} rotulo={tR("viagensRodadas")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder={tR("buscar")}
          aria-label={tR("buscar")}
          className="h-9 max-w-xs"
        />
        {filtros.map((f) => (
          <button
            key={f.valor || "todas"}
            type="button"
            aria-pressed={frente === f.valor}
            onClick={() => setFrente(f.valor)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              frente === f.valor
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {tR("jaRodamos")} <span className="text-muted-foreground">({rodadas.length})</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">{tR("jaRodamosAjuda")}</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tR("rota")}</TableHead>
                <TableHead>{tR("frente")}</TableHead>
                <TableHead className="text-right">{tR("rodadas")}</TableHead>
                <TableHead className="text-right">{tR("total")}</TableHead>
                <TableHead>{tR("ultima")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rodadas.map((r) => (
                <TableRow key={`${r.origem}>${r.destino}`}>
                  <TableCell>
                    <Rota rota={r} />
                  </TableCell>
                  <TableCell>
                    <Frente region={r.region} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.rodadas}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.viagens}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.ultimaRodada ?? "—"}</TableCell>
                </TableRow>
              ))}
              {rodadas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    {tR("vazio")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {tR("nuncaRodamos")} <span className="text-muted-foreground">({nunca.length})</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">{tR("nuncaRodamosAjuda")}</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tR("rota")}</TableHead>
                <TableHead>{tR("frente")}</TableHead>
                <TableHead className="text-right">{tR("total")}</TableHead>
                <TableHead>{tR("vistaAte")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nunca.map((r) => (
                <TableRow key={`${r.origem}>${r.destino}`}>
                  <TableCell>
                    <Rota rota={r} />
                  </TableCell>
                  <TableCell>
                    <Frente region={r.region} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.viagens}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.ultimaVista ?? "—"}</TableCell>
                </TableRow>
              ))}
              {nunca.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    {tR("vazio")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
