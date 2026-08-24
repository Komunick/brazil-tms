"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Eye, EyeOff, Palette } from "lucide-react";
import type { TripFilterOptions } from "@brazil-tms/db";
import { useMarcarViagem, useProgramacao } from "@/lib/trips/client";
import { ProgramacaoDetalhe } from "@/components/trips/programacao-detalhe";
import { TripStatusBadge } from "@/components/trips/trip-status-badge";
import { REGION_ORDER, type TripDisplayStatus } from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
 * A PROGRAMAÇÃO — o quadro que substitui a planilha do Google (2026-08-24, a pedido).
 *
 * ── O QUE ESTA TELA APOSENTA ──────────────────────────────────────────────────────────────────
 *
 * "PROGRAMAÇÃO 2026 | BRAZIL TRANSPORTS": 12.317 linhas, uma por LH, mantida à mão. Região, data,
 * estação de origem e destino, as duas horas da coleta, perfil do veículo, motorista, CPF, telefone,
 * cavalo e carreta — tudo isso o TMS já sabia, e ninguém via junto. A planilha existia por causa do
 * ARRANJO, não do dado: por dia, com ontem à vista, e com linhas pintadas à mão.
 *
 * ── ONTEM ENTRA, E É O QUE MAIS IMPORTA ───────────────────────────────────────────────────────
 *
 * Um quadro que começa em "hoje" perde a viagem que saiu ontem à noite e ainda está na estrada —
 * exatamente a que alguém precisa acompanhar de manhã. Por isso a janela abre em ontem, e cada
 * grupo diz em letras qual dia é: ONTEM, HOJE, AMANHÃ, e depois a data.
 *
 * ── A COR É PESSOAL, E O ESCONDER TAMBÉM ──────────────────────────────────────────────────────
 *
 * Na planilha, pintar uma linha avisava a todo mundo — e ninguém combinou o que cada cor significa.
 * Aqui a marca é de quem marca: some da tela do colega. Foi decisão explícita, e evita o que a
 * planilha tem hoje, que é um arco-íris cujo significado morreu com quem pintou.
 *
 * Esconder não apaga: a viagem continua no quadro de todos, e some só desta tela. É o "eu escolho
 * quais LH ver" do pedido — o quadro mostra tudo e a pessoa tira o que não é dela.
 */

/**
 * A PALETA É CURTA DE PROPÓSITO.
 *
 * A planilha usa a paleta inteira do Google, e o resultado é uma tela onde a cor deixou de
 * significar qualquer coisa. Seis tons, cada um distinguível do outro em relance e no escuro, é o
 * que uma pessoa consegue usar com consistência. Quem precisar de um sétimo significado precisa de
 * uma coluna, não de outra cor.
 */
const CORES = [
  { chave: "vermelho", classe: "bg-red-500/40 hover:bg-red-500/50", ponto: "bg-red-500" },
  { chave: "ambar", classe: "bg-amber-500/40 hover:bg-amber-500/50", ponto: "bg-amber-500" },
  { chave: "verde", classe: "bg-emerald-500/40 hover:bg-emerald-500/50", ponto: "bg-emerald-500" },
  { chave: "azul", classe: "bg-sky-500/40 hover:bg-sky-500/50", ponto: "bg-sky-500" },
  { chave: "roxo", classe: "bg-violet-500/40 hover:bg-violet-500/50", ponto: "bg-violet-500" },
  { chave: "cinza", classe: "bg-slate-500/40 hover:bg-slate-500/50", ponto: "bg-slate-500" },
] as const;

/**
 * QUARENTA POR CENTO, e não cem (2026-08-24, a pedido: "cores mais fortes").
 *
 * A primeira versão usava 15% e a marca sumia num relance — que é o oposto do que ela serve. Mas
 * cor cheia traria outro problema: o texto da linha é `foreground`, pensado para o fundo do tema, e
 * sobre vermelho sólido ele fica ilegível no claro e no escuro. Em 40% a linha salta de longe e as
 * letras continuam com contraste — testado nos dois temas.
 */

const classeDaCor = (cor: string | null): string =>
  CORES.find((c) => c.chave === cor)?.classe ?? "";

/** ONTEM/HOJE/AMANHÃ por extenso; do terceiro dia em diante a data já diz mais que a palavra. */
function rotuloDoDia(dia: string, hoje: string, t: (k: string) => string): string {
  const d = new Date(`${dia}T12:00:00`);
  const h = new Date(`${hoje}T12:00:00`);
  const diff = Math.round((d.getTime() - h.getTime()) / 86_400_000);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  if (diff === -1) return `${t("ontem")} · ${data}`;
  if (diff === 0) return `${t("hoje")} · ${data}`;
  if (diff === 1) return `${t("amanha")} · ${data}`;
  return `${d.toLocaleDateString("pt-BR", { weekday: "short" })} · ${data}`;
}

export function MinhaProgramacaoClient({ resourceOptions }: { resourceOptions: TripFilterOptions }) {
  const t = useTranslations("Programacao");
  const [frente, setFrente] = useState("");
  const [mostrarOcultas, setMostrarOcultas] = useState(false);
  const [busca, setBusca] = useState("");
  const [paletaAberta, setPaletaAberta] = useState<string | null>(null);
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const [viagemAberta, setViagemAberta] = useState<string | null>(null);

  const consulta = useProgramacao(frente, { atras: 2, adiante: 7 });
  const marcar = useMarcarViagem();

  const hoje = useMemo(() => {
    // O "hoje" da EMPRESA, não o do computador de quem olha: o servidor agrupa por São Paulo, e a
    // tela precisa concordar com ele para não chamar de "amanhã" o que o grupo chama de hoje.
    const agora = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    return agora;
  }, []);

  const linhas = consulta.data?.linhas ?? [];

  const visiveis = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return linhas.filter((l) => {
      if (l.oculta && !mostrarOcultas) return false;
      if (termo === "") return true;
      return [l.externalTripId, l.origem, l.destino, l.motorista, l.placa]
        .filter(Boolean)
        .some((c) => String(c).toUpperCase().includes(termo));
    });
  }, [linhas, busca, mostrarOcultas]);

  /** Agrupado por dia, na ordem em que o servidor devolveu — que já é a da hora de coleta. */
  const porDia = useMemo(() => {
    const mapa = new Map<string, typeof visiveis>();
    for (const l of visiveis) {
      const atual = mapa.get(l.dia);
      if (atual) atual.push(l);
      else mapa.set(l.dia, [l]);
    }
    return [...mapa.entries()];
  }, [visiveis]);

  const ocultas = linhas.filter((l) => l.oculta).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          {/* A frente da estação de ORIGEM, como no resto do painel — a mesma régua em toda tela. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">{t("porFrente")}</span>
            {[{ valor: "", rotulo: t("todasAsFrentes") }, ...REGION_ORDER.map((r) => ({ valor: r, rotulo: r }))].map(
              (f) => (
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
              ),
            )}
          </div>

          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("buscarPlaceholder")}
            className="h-8 max-w-xs"
          />

          {/* Só aparece quando existe algo escondido: um botão que nunca faz nada é ruído. */}
          {ocultas > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setMostrarOcultas((v) => !v)}
            >
              {mostrarOcultas ? (
                <EyeOff className="mr-1 h-3.5 w-3.5" aria-hidden />
              ) : (
                <Eye className="mr-1 h-3.5 w-3.5" aria-hidden />
              )}
              {mostrarOcultas ? t("esconderOcultas") : t("verOcultas", { n: ocultas })}
            </Button>
          ) : null}

          <span className="ml-auto text-xs text-muted-foreground">
            {t("totalLinhas", { n: visiveis.length })}
          </span>
        </CardContent>
      </Card>

      {consulta.isPending ? <Skeleton className="h-96 w-full" /> : null}

      {!consulta.isPending && porDia.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("vazio")}</p>
          </CardContent>
        </Card>
      ) : null}

      {porDia.map(([dia, doDia]) => (
        <Card key={dia}>
          <CardContent className="overflow-x-auto pt-6">
            {/*
              O DIA INTEIRO RECOLHE (2026-08-24, a pedido).
              Com anteontem, ontem, hoje e mais sete dias, a página passa de quinhentas linhas — e
              quem está tocando a operação de hoje não quer rolar por cima de sexta-feira. O botão é
              o cabeçalho todo, não uma setinha: alvo grande para uma ação que se repete o dia
              inteiro. A contagem CONTINUA visível recolhida, senão fechar o dia esconderia também a
              informação de que ele existe e tem trabalho dentro.
            */}
            <button
              type="button"
              aria-expanded={!recolhidos.has(dia)}
              onClick={() =>
                setRecolhidos((atuais) => {
                  const novo = new Set(atuais);
                  if (novo.has(dia)) novo.delete(dia);
                  else novo.add(dia);
                  return novo;
                })
              }
              className="mb-2 flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-muted/50"
            >
              {recolhidos.has(dia) ? (
                <ChevronRight className="h-4 w-4 self-center text-muted-foreground" aria-hidden />
              ) : (
                <ChevronDown className="h-4 w-4 self-center text-muted-foreground" aria-hidden />
              )}
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                {rotuloDoDia(dia, hoje, t)}
              </h2>
              <span className="text-xs text-muted-foreground">
                {t("lhsNoDia", { n: doDia.length })}
              </span>
            </button>

            <Table className={cn(recolhidos.has(dia) && "hidden")}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>{t("lh")}</TableHead>
                  <TableHead>{t("rota")}</TableHead>
                  <TableHead>{t("etaOrigem")}</TableHead>
                  <TableHead>{t("cptOrigem")}</TableHead>
                  <TableHead>{t("etaDestino")}</TableHead>
                  <TableHead>{t("perfil")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("motorista")}</TableHead>
                  <TableHead>{t("placa")}</TableHead>
                  <TableHead>{t("contato")}</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {doDia.map((l) => (
                  <TableRow
                    key={l.tripId}
                    className={cn(classeDaCor(l.cor), l.oculta && "opacity-40")}
                  >
                    {/* A paleta abre na própria linha: pintar é gesto de tela, não vale uma janela. */}
                    <TableCell className="p-1">
                      <div className="relative">
                        <button
                          type="button"
                          aria-label={t("marcarCor")}
                          onClick={() =>
                            setPaletaAberta((a) => (a === l.tripId ? null : l.tripId))
                          }
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                          <Palette className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        {paletaAberta === l.tripId ? (
                          <div className="absolute z-20 mt-1 flex gap-1 rounded-md border bg-background p-1.5 shadow-md">
                            {CORES.map((c) => (
                              <button
                                key={c.chave}
                                type="button"
                                aria-label={c.chave}
                                className={cn("h-4 w-4 rounded-full", c.ponto)}
                                onClick={() => {
                                  marcar.mutate({ tripId: l.tripId, cor: c.chave });
                                  setPaletaAberta(null);
                                }}
                              />
                            ))}
                            <button
                              type="button"
                              aria-label={t("semCor")}
                              className="h-4 w-4 rounded-full border"
                              onClick={() => {
                                marcar.mutate({ tripId: l.tripId, cor: null });
                                setPaletaAberta(null);
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </TableCell>

                    <TableCell className="font-mono text-xs">
                      {/*
                        Clicar na LH abre uma JANELA, não outra página (2026-08-24, a pedido).
                        Numa programação de centenas de linhas, sair da tela é perder o lugar na
                        lista — e o lugar é o fio de quem está trabalhando. A janela traz o que se
                        decide daqui: onde a viagem está, o que já aconteceu e quem vai dirigir; o
                        resto continua na tela própria, a um clique de dentro dela.
                      */}
                      <button
                        type="button"
                        onClick={() => setViagemAberta(l.tripId)}
                        className="underline underline-offset-2 hover:text-primary"
                      >
                        {l.externalTripId ?? "—"}
                      </button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {l.origem ?? "—"}
                      <span className="px-1 text-muted-foreground">→</span>
                      {l.destino ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">
                      {l.etaOrigem ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">
                      {l.cptOrigem ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">
                      {l.etaDestino ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs uppercase">{l.perfil ?? "—"}</TableCell>
                    <TableCell>
                      <TripStatusBadge
                        status={l.status as TripDisplayStatus}
                        portalAcceptance={l.acceptanceStatus}
                        portalStatus={l.portalStatus}
                      />
                    </TableCell>
                    <TableCell className="text-xs">{l.motorista || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {l.placa || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {/* Discar no celular, copiar no computador — o `tel:` faz as duas. */}
                      {l.telefone ? (
                        <a className="underline underline-offset-2" href={`tel:${l.telefone}`}>
                          {l.telefone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="p-1 text-right">
                      <button
                        type="button"
                        aria-label={l.oculta ? t("mostrar") : t("esconder")}
                        title={l.oculta ? t("mostrar") : t("esconder")}
                        onClick={() => marcar.mutate({ tripId: l.tripId, oculta: !l.oculta })}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        {l.oculta ? (
                          <Eye className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <ProgramacaoDetalhe
        tripId={viagemAberta}
        aberto={viagemAberta !== null}
        aoFechar={() => setViagemAberta(null)}
        resourceOptions={resourceOptions}
      />
    </div>
  );
}
