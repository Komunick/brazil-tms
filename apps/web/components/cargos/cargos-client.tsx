"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Users } from "lucide-react";
import type { GrupoDoCatalogo } from "@/lib/auth/catalogo-de-acesso";
import { GRUPO_DAS_ACOES, ROTULO_DA_ACAO } from "@/lib/auth/catalogo-de-acesso";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Cargo {
  id: string;
  nome: string;
  ativo: boolean;
  pessoas: number;
  permissoes: string[];
}

/**
 * A TELA DE CARGOS (fatia 029, US1).
 *
 * ── O QUE ELA CONSERTA, MEDIDO ────────────────────────────────────────────────────────────────
 *
 * Dos 34 usuários ativos, **20 eram `admin`** — não por desleixo, mas porque o catálogo de papéis
 * vivia em código e quem precisava de uma combinação que não existia nele virava admin. Aqui a
 * combinação passa a ser feita por quem administra, sem deploy.
 *
 * ── A CONTAGEM DE PESSOAS VEM ANTES DE QUALQUER EDIÇÃO (FR-008) ───────────────────────────────
 *
 * Desativar um cargo com catorze pessoas dentro é outra conversa. Descobrir isso depois de clicar é
 * descobrir tarde.
 *
 * ── AS MARCAS SÃO POR CAPACIDADE, COM AS PÁGINAS LISTADAS JUNTO ───────────────────────────────
 *
 * Sete itens de menu pedem `view_all_trips`. Uma caixa por PÁGINA deixaria marcar "Torre de
 * Controle" sem marcar "Ocorrências" — uma promessa que o servidor não tem como cumprir, porque a
 * chave que ele verifica é a mesma. A caixa é da capacidade; as páginas aparecem ao lado para dizer
 * o que ela abre.
 */
export function CargosClient({ catalogo }: { catalogo: GrupoDoCatalogo[] }) {
  const t = useTranslations("Cargos");
  const tNav = useTranslations("Nav");
  const tGrupo = useTranslations("Nav.grupos");
  const qc = useQueryClient();

  const [aberto, setAberto] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Cargo | null>(null);
  const [nomeNovo, setNomeNovo] = useState("");
  const [recusa, setRecusa] = useState<string[] | null>(null);
  /** Para onde vão as pessoas quando o cargo é desativado (FR-011). */
  const [destino, setDestino] = useState("");

  const consulta = useQuery({
    queryKey: ["cargos"],
    queryFn: async () => {
      const res = await fetch("/api/cargos");
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { cargos: Cargo[] };
    },
    // Cargo muda algumas vezes por mês; recarregar de minuto em minuto seria pedir trabalho ao banco
    // para responder sempre a mesma coisa. Quem edita vê o efeito pela invalidação, logo abaixo.
    staleTime: 5 * 60_000,
  });

  const salvar = useMutation({
    mutationFn: async (cargo: Cargo) => {
      const res = await fetch(`/api/cargos/${cargo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: cargo.nome,
          ativo: cargo.ativo,
          permissoes: cargo.permissoes,
        }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(JSON.stringify(corpo.motivos ?? ["ERRO"]));
      return corpo as { cargo: Cargo | null };
    },
    onSuccess: () => {
      setRecusa(null);
      setAberto(null);
      setRascunho(null);
      void qc.invalidateQueries({ queryKey: ["cargos"] });
    },
    /*
      A RECUSA É MOSTRADA INTEIRA, e não o primeiro motivo.

      O servidor devolve todos (`motivosParaRecusar`). Mostrar um de cada vez faria a pessoa
      corrigir, tentar, e descobrir o seguinte — três idas até entender o que faltava.
    */
    onError: (e: Error) => {
      try {
        setRecusa(JSON.parse(e.message) as string[]);
      } catch {
        setRecusa(["ERRO"]);
      }
    },
  });

  const desativar = useMutation({
    mutationFn: async ({ id, moverPara }: { id: string; moverPara: string | null }) => {
      const res = await fetch(`/api/cargos/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moverPara }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(JSON.stringify(corpo.motivos ?? ["ERRO"]));
    },
    onSuccess: () => {
      setRecusa(null);
      setAberto(null);
      setDestino("");
      void qc.invalidateQueries({ queryKey: ["cargos"] });
    },
    onError: (e: Error) => {
      try {
        setRecusa(JSON.parse(e.message) as string[]);
      } catch {
        setRecusa(["ERRO"]);
      }
    },
  });

  const criar = useMutation({
    mutationFn: async (nome: string) => {
      const res = await fetch("/api/cargos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: () => {
      setNomeNovo("");
      void qc.invalidateQueries({ queryKey: ["cargos"] });
    },
  });

  const cargos = consulta.data?.cargos ?? [];

  function abrir(c: Cargo): void {
    setAberto(c.id);
    setRascunho({ ...c, permissoes: [...c.permissoes] });
    setRecusa(null);
  }

  function alternar(permissao: string): void {
    setRascunho((r) =>
      r === null
        ? r
        : {
            ...r,
            permissoes: r.permissoes.includes(permissao)
              ? r.permissoes.filter((p) => p !== permissao)
              : [...r.permissoes, permissao],
          },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="cargo-novo">{t("nomeDoNovo")}</Label>
          <Input
            id="cargo-novo"
            value={nomeNovo}
            onChange={(e) => setNomeNovo(e.target.value)}
            placeholder={t("exemploDeNome")}
            className="w-64"
          />
        </div>
        <Button
          type="button"
          disabled={nomeNovo.trim().length < 2 || criar.isPending}
          onClick={() => criar.mutate(nomeNovo.trim())}
        >
          {t("criar")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("nasceVazio")}</p>
      </div>

      {consulta.isPending ? <Skeleton className="h-64 w-full" /> : null}

      {cargos.map((c) => (
        <Card key={c.id} className={cn(!c.ativo && "opacity-60")}>
          <CardContent className="space-y-3 pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="font-medium">{c.nome}</span>
              {/* A CONTAGEM VEM ANTES DA EDIÇÃO (FR-008) — ver o comentário do topo. */}
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" aria-hidden />
                {t("pessoas", { n: String(c.pessoas) })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("capacidades", { n: String(c.permissoes.length) })}
              </span>
              {!c.ativo ? <span className="text-xs">{t("inativo")}</span> : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => (aberto === c.id ? setAberto(null) : abrir(c))}
              >
                {aberto === c.id ? t("fechar") : t("editar")}
              </Button>
            </div>

            {aberto === c.id && rascunho ? (
              <div className="space-y-4 rounded-md border border-dashed p-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`nome-${c.id}`}>{t("nome")}</Label>
                  <Input
                    id={`nome-${c.id}`}
                    value={rascunho.nome}
                    onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                    className="max-w-sm"
                  />
                  {/* Renomear não muda acesso: o vínculo é pelo id. Dito aqui para ninguém temer. */}
                  <p className="text-xs text-muted-foreground">{t("renomearNaoMudaAcesso")}</p>
                </div>

                {catalogo.map((grupo) => (
                  <div key={grupo.chave} className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {grupo.chave === GRUPO_DAS_ACOES ? t("acoes") : tGrupo(grupo.chave)}
                    </p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {grupo.itens.map((item) => (
                        <label
                          key={item.permissao}
                          className="flex cursor-pointer items-start gap-2 rounded p-1 text-sm hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={rascunho.permissoes.includes(item.permissao)}
                            onChange={() => alternar(item.permissao)}
                          />
                          <span>
                            {grupo.chave === GRUPO_DAS_ACOES
                              ? ROTULO_DA_ACAO[item.permissao]
                              : item.paginas.map((p) => tNav(p)).join(" · ")}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {/* CARGO SEM NADA MARCADO é permitido, e parece defeito — por isso o aviso. */}
                {rascunho.permissoes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("avisoCargoVazio")}</p>
                ) : null}

                {recusa ? (
                  <ul role="alert" className="space-y-1 text-sm text-destructive">
                    {recusa.map((m) => (
                      <li key={m}>{t(`recusa.${m}`)}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={salvar.isPending}
                    onClick={() => salvar.mutate(rascunho)}
                  >
                    {salvar.isPending ? t("salvando") : t("salvar")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(null)}>
                    {t("cancelar")}
                  </Button>

                  {/*
                    DESATIVAR fica no fim e em tom apagado: é a ação mais rara e a de maior estrago.
                    Ela NÃO apaga (princípio III) — o histórico de quem esteve no cargo é o que
                    responde "por que fulano conseguia cancelar viagem em março?".

                    Com gente dentro, o destino é OBRIGATÓRIO (FR-011): quem fica sem cargo fica com
                    conjunto vazio, entra no sistema e não vê nada.
                  */}
                  {c.ativo ? (
                    <div className="ml-auto flex items-center gap-2">
                      {c.pessoas > 0 ? (
                        <select
                          aria-label={t("moverPara")}
                          className="h-8 rounded-md border bg-background px-2 text-xs"
                          value={destino}
                          onChange={(e) => setDestino(e.target.value)}
                        >
                          <option value="">{t("escolhaDestino", { n: String(c.pessoas) })}</option>
                          {cargos
                            .filter((o) => o.ativo && o.id !== c.id)
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nome}
                              </option>
                            ))}
                        </select>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        disabled={desativar.isPending || (c.pessoas > 0 && destino === "")}
                        onClick={() => desativar.mutate({ id: c.id, moverPara: destino || null })}
                      >
                        {t("desativar")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
