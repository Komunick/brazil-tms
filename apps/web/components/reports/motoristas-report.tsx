"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { DesempenhoDoMotorista, DesempenhoNaRota } from "@brazil-tms/db";
import { useDesempenhoDeMotoristas } from "@/lib/trips/client";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
 *   A NOTA ORDENA, O PERCENTUAL EXPLICA. O percentual cru premia quem rodou pouco — duas entregas a
 *   100% na frente de vinte a 93% —, e escalar por isso é escalar por sorte. A nota é o mesmo
 *   percentual com um crédito inicial na média da empresa; quem tem volume chega perto do próprio
 *   número, quem tem duas viagens fica perto da média.
 *
 *   OS TRÊS FICAM NA TELA — entregas, percentual e nota. Esconder qualquer um seria pedir confiança
 *   cega; e quem tem pouca amostra continua visível, só que embaixo, porque a nota o coloca lá.
 *   Sumir seria pior: quem procura motorista precisa saber que ele rodou a rota duas vezes, e não
 *   concluir que nunca rodou.
 *
 * ── DUAS VISTAS, UMA TABELA DE CADA VEZ (2026-08-23: "é muito ruim descer até lá embaixo") ─────
 *
 * As duas tabelas empilhadas somavam 513 motoristas seguidos de 107 rotas: para chegar à segunda,
 * que é a que decide escala, era preciso rolar por toda a primeira. E a de rota, empilhada, mostrava
 * 107 blocos quando a pessoa queria UM.
 *
 * Agora a vista por rota PEDE a rota, num seletor com busca, e mostra uma tabela só. O número ao
 * lado de cada rota na lista é quantos motoristas já a rodaram — é o que diz se vale comparar.
 */

/**
 * Abaixo disto a amostra é pouca, e a tela diz isso apagando o percentual.
 *
 * Não muda a ORDEM — quem ordena é a nota, que já cuida disso sozinha. É só o aviso visual de que
 * aquele número ainda não significa muito.
 *
 * Mora AQUI, e não no pacote de banco: é decisão de tela, e importar um VALOR de lá num componente
 * de cliente arrasta o driver do Postgres para o pacote do navegador — o build quebra pedindo `net`
 * e `tls`. Tipo se apaga na compilação e pode vir de lá; valor, não.
 */
const POUCA_AMOSTRA = 4;

function Percentual({ pct, entregas }: { pct: number; entregas: number }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        entregas < POUCA_AMOSTRA ? "text-muted-foreground" : "text-foreground",
      )}
    >
      {pct}%
    </span>
  );
}

/** A nota é o número que ordena — por isso é ela que ganha cor e peso. */
function Nota({ nota }: { nota: number }) {
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        nota >= 90 ? "text-success" : nota >= 80 ? "text-warning" : "text-destructive",
      )}
    >
      {nota}
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
      <TableCell className="text-right">
        <Nota nota={d.nota} />
      </TableCell>
    </>
  );
}

function Cabecalho() {
  const t = useTranslations("Reports.motoristas");
  return (
    <TableHeader>
      <TableRow>
        <TableHead>{t("motorista")}</TableHead>
        <TableHead className="text-right">{t("entregas")}</TableHead>
        <TableHead className="text-right">{t("noPrazo")}</TableHead>
        <TableHead className="text-right">{t("pct")}</TableHead>
        <TableHead className="text-right">{t("nota")}</TableHead>
      </TableRow>
    </TableHeader>
  );
}

/** A ordem do ranking é a da NOTA; o volume só desempata. */
function ordenar<T extends DesempenhoDoMotorista>(lista: T[]): T[] {
  return [...lista].sort((a, b) => b.nota - a.nota || b.entregas - a.entregas);
}

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

export function MotoristasReport() {
  const t = useTranslations("Reports");
  const tM = useTranslations("Reports.motoristas");
  const query = useDesempenhoDeMotoristas();
  const [vista, setVista] = useState<"geral" | "rota">("geral");
  const [termo, setTermo] = useState("");
  const [rotaId, setRotaId] = useState("");

  const busca = termo.trim().toLowerCase();

  const geral = useMemo(
    () =>
      ordenar(
        (query.data?.geral ?? []).filter(
          (d) => !busca || d.motorista.toLowerCase().includes(busca),
        ),
      ),
    [query.data, busca],
  );

  /** Por rota: agrupado por rota, cada grupo já na ordem do ranking. */
  const rotas = useMemo(() => {
    const porRota = new Map<string, { id: string; titulo: string; linhas: DesempenhoNaRota[] }>();
    for (const d of query.data?.porRota ?? []) {
      const atual = porRota.get(d.laneId) ?? {
        id: d.laneId,
        titulo: `${d.origem} → ${d.destino}`,
        linhas: [],
      };
      atual.linhas.push(d);
      porRota.set(d.laneId, atual);
    }
    return [...porRota.values()]
      .map((g) => ({ ...g, linhas: ordenar(g.linhas) }))
      .sort(
        (a, b) => b.linhas.length - a.linhas.length || a.titulo.localeCompare(b.titulo, "pt-BR"),
      );
  }, [query.data]);

  /** Sem escolha, abre a rota com mais motoristas: é a que mais tem o que comparar. */
  const rotaAberta = rotas.find((r) => r.id === rotaId) ?? rotas[0] ?? null;

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
        <Numero valor={entregas.toLocaleString("pt-BR")} rotulo={tM("entregasMedidas")} />
        <Numero
          valor={`${entregas === 0 ? 0 : Math.round((noPrazo / entregas) * 100)}%`}
          rotulo={tM("pctGeral")}
          cor="text-success"
        />
        <Numero valor={String(todas.length)} rotulo={tM("motoristas")} />
        <Numero
          valor={String(todas.filter((d) => d.emViagem).length)}
          rotulo={tM("emViagemAgora")}
        />
      </div>

      <div className="flex gap-1 border-b" role="tablist" aria-label={tM("geral")}>
        {(["geral", "rota"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={vista === v}
            onClick={() => setVista(v)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              vista === v
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tM(v === "geral" ? "vistaGeral" : "vistaPorRota")}
          </button>
        ))}
      </div>

      {vista === "geral" ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{tM("geral")}</CardTitle>
            <p className="text-xs text-muted-foreground">{tM("geralAjuda")}</p>
          </CardHeader>
          <CardContent className="space-y-3 overflow-x-auto">
            <Input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder={tM("buscarMotorista")}
              aria-label={tM("buscarMotorista")}
              className="h-9 max-w-sm"
            />
            <Table>
              <Cabecalho />
              <TableBody>
                {geral.map((d) => (
                  <TableRow key={d.motorista}>
                    <LinhaDoMotorista d={d} />
                  </TableRow>
                ))}
                {geral.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      {tM("vazio")}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{tM("porRota")}</CardTitle>
            <p className="text-xs text-muted-foreground">{tM("porRotaAjuda")}</p>
          </CardHeader>
          <CardContent className="space-y-3 overflow-x-auto">
            <div className="max-w-xl">
              <SearchableSelect
                id="rota-do-ranking"
                value={rotaAberta?.id ?? ""}
                options={rotas.map((r) => ({
                  id: r.id,
                  label: `${r.titulo}  ·  ${r.linhas.length}`,
                }))}
                onChange={(id) => setRotaId(id ?? "")}
                placeholder={tM("escolherRota")}
                emptyText={tM("vazio")}
              />
            </div>
            {rotaAberta ? (
              <Table>
                <Cabecalho />
                <TableBody>
                  {rotaAberta.linhas.map((d) => (
                    <TableRow key={`${d.laneId}:${d.motorista}`}>
                      <LinhaDoMotorista d={d} />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">{tM("vazio")}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
