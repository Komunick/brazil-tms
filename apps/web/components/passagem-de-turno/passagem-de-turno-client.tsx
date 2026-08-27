"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Lock } from "lucide-react";
import {
  DEFINICAO_DO_TURNO,
  ROTULO_DO_SETOR,
  SECOES_DO_SETOR,
  SETORES,
  TURNOS,
  type Setor,
  type Turno,
  podeEditarOSetor,
} from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { avisar } from "@/lib/ui/avisos";
import { cn } from "@/lib/utils";
import { ResumoDaOperacao } from "./resumo-da-operacao";
import { LinhaDoTempo } from "./linha-do-tempo";
import { SecaoDoSetor, type ItemNaTela } from "./secao-do-setor";

interface BlocoDaApi {
  id: string;
  data: string;
  turno: Turno;
  setor: Setor;
  assistente: string | null;
  supervisor: string | null;
  fechadoEm: string | null;
  fechadoAutomaticamente: boolean;
  itens: ItemNaTela[];
  digitados: Record<string, string>;
  apurados: Record<string, number>;
}

/**
 * A PASSAGEM DE TURNO (2026-08-26, a pedido) — o diário que hoje vive numa planilha.
 *
 * ── A NAVEGAÇÃO É `(data, turno, setor)`, PORQUE A UNIDADE É ESSA ─────────────────────────────
 *
 * Cinco setores × dois turnos = dez blocos por dia. A planilha empilha os cinco setores um sob o
 * outro e põe os dois turnos lado a lado, o que cabe numa folha e não cabe numa tela — daí as abas.
 *
 * ── POR QUE ELA ABRE NO TURNO CORRENTE E NÃO NO DE HOJE ───────────────────────────────────────
 *
 * `turnoDe` decide isso no SERVIDOR, e às 2h da manhã a resposta é "o noturno de ONTEM". Abrir no
 * bloco de hoje faria o plantonista da madrugada escrever num turno que ainda não começou, e
 * perder metade do seu.
 *
 * ── E POR QUE ELA SE ATUALIZA SOZINHA ─────────────────────────────────────────────────────────
 *
 * Duas pessoas do mesmo setor podem estar escrevendo — o assistente e o supervisor — e os
 * contadores apurados mudam a cada viagem que entra. Polling via TanStack Query, que é o que a
 * constituição manda (sem Realtime).
 */
export function PassagemDeTurnoClient({
  dataInicial,
  turnoInicial,
  meuSetor,
  ehAdmin,
}: {
  dataInicial: string;
  turnoInicial: Turno;
  meuSetor: Setor | null;
  ehAdmin: boolean;
}) {
  const t = useTranslations("PassagemTurno");
  const qc = useQueryClient();
  const [data, setData] = useState(dataInicial);
  const [turno, setTurno] = useState<Turno>(turnoInicial);
  /**
   * A aba abre NO SETOR DA PESSOA quando ela tem um.
   *
   * Quem tem setor vem para escrever, e abrir na Programação obrigaria o pessoal do Monitoring a
   * dar um clique extra em todo acesso. Quem não tem setor vem para ler, e a Programação é a
   * primeira faixa da planilha.
   */
  const [setor, setSetor] = useState<Setor>(meuSetor ?? "PROGRAMACAO");

  const chave = ["passagem-de-turno", data, turno, setor] as const;

  const consulta = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const p = new URLSearchParams({ data, turno, setor });
      const res = await fetch(`/api/passagem-de-turno?${p}`);
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { bloco: BlocoDaApi; meuSetor: Setor | null };
    },
    refetchInterval: 20_000,
  });

  const bloco = consulta.data?.bloco;
  const fechado = Boolean(bloco?.fechadoEm);
  const podeOSetor = podeEditarOSetor({ ehAdmin, setorDoUsuario: meuSetor, setorAlvo: setor });
  const editavel = podeOSetor && !fechado;

  const recarregar = () => void qc.invalidateQueries({ queryKey: chave });

  /** Um erro de gravação NÃO some sozinho: se o item não entrou, quem escreveu precisa saber. */
  const reclamar = async (res: Response) => {
    const corpo = (await res.json().catch(() => null)) as {
      error?: string;
      problemas?: string[];
    } | null;
    avisar({
      tipo: "erro",
      texto: corpo?.problemas?.join(" · ") ?? corpo?.error ?? t("naoGravou"),
    });
    // 409 é "o turno fechou enquanto você escrevia" — recarregar mostra a tela travada, que explica.
    if (res.status === 409) recarregar();
  };

  const salvarItem = useMutation({
    mutationFn: async (item: {
      itemId: string | null;
      secao: string;
      dados: Record<string, string>;
    }) => {
      if (!bloco) return;
      const res = await fetch("/api/passagem-de-turno/item", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...item, setor, blocoId: bloco.id }),
      });
      if (!res.ok) return reclamar(res);
      recarregar();
    },
  });

  const removerItem = useMutation({
    mutationFn: async (itemId: string) => {
      if (!bloco) return;
      const res = await fetch("/api/passagem-de-turno/item", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setor, blocoId: bloco.id, itemId }),
      });
      if (!res.ok) return reclamar(res);
      recarregar();
    },
  });

  const salvarContador = useMutation({
    mutationFn: async ({ chave: k, valor }: { chave: string; valor: string }) => {
      if (!bloco) return;
      const res = await fetch("/api/passagem-de-turno/contador", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setor, turno, blocoId: bloco.id, chave: k, valor }),
      });
      if (!res.ok) return reclamar(res);
      recarregar();
    },
  });

  const salvarNomes = useMutation({
    mutationFn: async (nomes: { assistente?: string; supervisor?: string }) => {
      if (!bloco) return;
      const res = await fetch("/api/passagem-de-turno", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...nomes, setor, blocoId: bloco.id }),
      });
      if (!res.ok) return reclamar(res);
      recarregar();
    },
  });

  const [confirmandoEntrega, setConfirmandoEntrega] = useState(false);
  const entregar = useMutation({
    mutationFn: async () => {
      if (!bloco) return;
      const res = await fetch("/api/passagem-de-turno/fechar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setor, blocoId: bloco.id }),
      });
      if (!res.ok) return reclamar(res);
      setConfirmandoEntrega(false);
      avisar({ tipo: "ok", texto: t("turnoEntregue") });
      recarregar();
    },
  });

  const porSecao = useMemo(() => {
    const mapa = new Map<string, ItemNaTela[]>();
    for (const item of bloco?.itens ?? []) {
      const lista = mapa.get(item.secao) ?? [];
      lista.push(item);
      mapa.set(item.secao, lista);
    }
    return mapa;
  }, [bloco]);

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("titulo")}</h1>
          <p className="text-muted-foreground">{t("subtitulo")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="h-8 w-40"
            aria-label={t("data")}
          />
          <div className="flex rounded-md border p-0.5" role="group" aria-label={t("turno")}>
            {TURNOS.map((t) => (
              <button
                key={t}
                onClick={() => setTurno(t)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  turno === t ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
                aria-pressed={turno === t}
              >
                {DEFINICAO_DO_TURNO[t].rotulo}
              </button>
            ))}
          </div>
          {(data !== dataInicial || turno !== turnoInicial) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1"
              onClick={() => {
                setData(dataInicial);
                setTurno(turnoInicial);
              }}
            >
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {t("turnoAtual")}
            </Button>
          )}
        </div>

        {/*
          AS ABAS DE SETOR mostram o da pessoa marcado.

          Sem a marca, quem tem setor teria de lembrar qual é o seu toda vez — e num sistema em que
          a permissão de escrita depende exatamente disso, "qual é o meu?" é a pergunta que a tela
          deve responder sem ser perguntada.
        */}
        <nav className="flex flex-wrap gap-1 border-b" aria-label={t("setor")}>
          {SETORES.map((s) => (
            <button
              key={s}
              onClick={() => setSetor(s)}
              className={cn(
                "-mb-px border-b-2 px-3 py-1.5 text-sm transition-colors",
                setor === s
                  ? "border-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              aria-current={setor === s ? "page" : undefined}
            >
              {ROTULO_DO_SETOR[s]}
              {meuSetor === s ? (
                <span className="ml-1.5 text-xs text-primary" title={t("oSeuSetor")}>
                  •
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </header>

      {consulta.isPending ? (
        <p className="text-sm text-muted-foreground">{t("carregando")}</p>
      ) : !bloco ? (
        <p className="text-sm text-destructive">{t("naoCarregou")}</p>
      ) : (
        <>
          {/* Por que não posso escrever — dito uma vez, no topo, em vez de campos mudos. */}
          {!editavel ? (
            <p className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              {fechado ? (
                /*
                  Fechado pela trava NÃO é o mesmo que entregue por alguém, e a tela diz qual foi.
                  Um bloco travado por esquecimento não teve passagem, e quem lê precisa saber disso
                  antes de confiar no que está escrito.

                  A DATA vai formatada em São Paulo, e não pelo relógio de quem abre: um turno
                  entregue às 19h05 apareceria como 22h05 num navegador em UTC, e a hora da entrega
                  é justamente o que se confere quando algo deu errado no meio da passagem.
                */
                <span>
                  {bloco.fechadoEm
                    ? t("entregueEm", {
                        quando: new Date(bloco.fechadoEm).toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                        }),
                      })
                    : t("entregueSemData")}
                  {bloco.fechadoAutomaticamente ? t("pelaTrava") : "."} {t("soLeitura")}
                </span>
              ) : (
                <span>
                  {t("faixaDeOutroSetor", { setor: ROTULO_DO_SETOR[setor] })}{" "}
                  {meuSetor
                    ? t("suaContaResponde", { setor: ROTULO_DO_SETOR[meuSetor] })
                    : t("semSetor")}
                </span>
              )}
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="order-2 space-y-5 lg:order-1">
              {SECOES_DO_SETOR[setor].map((secao) => (
                <SecaoDoSetor
                  key={secao.chave}
                  setor={setor}
                  secao={secao}
                  itens={porSecao.get(secao.chave) ?? []}
                  editavel={editavel}
                  aoSalvar={(item) => salvarItem.mutate(item)}
                  aoRemover={(id) => removerItem.mutate(id)}
                />
              ))}
            </div>

            <aside className="order-1 space-y-3 lg:order-2">
              <section className="space-y-2 rounded-lg border p-3">
                <NomeDaFaixa
                  rotulo={t("assistente")}
                  placeholder={t("quemEstaNoTurno")}
                  valor={bloco.assistente ?? ""}
                  editavel={editavel}
                  aoSalvar={(v) => salvarNomes.mutate({ assistente: v })}
                />
                <NomeDaFaixa
                  rotulo={t("supervisor")}
                  placeholder={t("quemEstaNoTurno")}
                  valor={bloco.supervisor ?? ""}
                  editavel={editavel}
                  aoSalvar={(v) => salvarNomes.mutate({ supervisor: v })}
                />
              </section>

              <ResumoDaOperacao
                setor={setor}
                turno={turno}
                digitados={bloco.digitados}
                apurados={bloco.apurados}
                editavel={editavel}
                aoSalvar={(k, valor) => salvarContador.mutate({ chave: k, valor })}
              />

              {editavel ? (
                /*
                  ENTREGAR PEDE CONFIRMAÇÃO porque NÃO HÁ COMO REABRIR.

                  Um turno reabrível seria um turno reescrito depois que alguém já leu e agiu — e
                  ler o turno anterior é para onde este diário existe. Então a porta fecha de vez, e
                  por isso o clique não pode ser o primeiro.
                */
                confirmandoEntrega ? (
                  <div className="space-y-2 rounded-lg border border-primary/40 p-3">
                    <p className="text-sm">{t("avisoDaEntrega")}</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => entregar.mutate()}
                        disabled={entregar.isPending}
                      >
                        {t("entregar")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmandoEntrega(false)}
                      >
                        {t("cancelar")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => setConfirmandoEntrega(true)}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    {t("entregarTurno")}
                  </Button>
                )
              ) : null}
            </aside>
          </div>
        </>
      )}

      <LinhaDoTempo
        atual={{ data, turno, setor }}
        aoEscolher={(b) => {
          setData(b.data);
          setTurno(b.turno);
          setSetor(b.setor);
        }}
      />
    </div>
  );
}

function NomeDaFaixa({
  rotulo,
  placeholder,
  valor,
  editavel,
  aoSalvar,
}: {
  rotulo: string;
  placeholder: string;
  valor: string;
  editavel: boolean;
  aoSalvar: (v: string) => void;
}) {
  const [rascunho, setRascunho] = useState(valor);

  if (!editavel) {
    return (
      <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
        <span className="text-xs text-muted-foreground">{rotulo}</span>
        <span className="truncate text-sm">{valor || "—"}</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
      <label className="text-xs text-muted-foreground" htmlFor={`nome-${rotulo}`}>
        {rotulo}
      </label>
      <Input
        id={`nome-${rotulo}`}
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={() => {
          if (rascunho !== valor) aoSalvar(rascunho);
        }}
        className="h-7 text-sm"
        placeholder={placeholder}
      />
    </div>
  );
}
