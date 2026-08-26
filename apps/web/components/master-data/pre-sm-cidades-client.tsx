"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CorrespondenciaDaCidade } from "@brazil-tms/db";
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
 * CONFERIR AS CORRESPONDÊNCIAS ESTAÇÃO → CIDADE (2026-08-26, fatia 027).
 *
 * ── O QUE ESTA TELA DECIDE, E POR QUE ELA EXISTE ──────────────────────────────────────────────
 *
 * O `setPreSM` pede o código IBGE das cidades de coleta e de entrega. A carga tira a cidade do NOME
 * da estação — `SOC_MG_BETIM` vira `MG · BETIM` — e casa contra as 5.571 cidades do cadastro dela,
 * tolerando sufixo de bairro ao descartar termos do fim.
 *
 * Ela acerta a maioria, e o que erra **não erra em branco: erra apontando para OUTRA cidade**.
 * `RECIFE MURIBECA` cairia em `RECIFE` mesmo se Muribeca fosse município próprio.
 *
 * Uma Pré-SM com a cidade errada é escolta contratada para um trajeto que o caminhão não vai fazer.
 * Ninguém percebe até o veículo estar na estrada.
 *
 * ── AS PENDENTES VÊM PRIMEIRO ─────────────────────────────────────────────────────────────────
 *
 * Elas são o trabalho; as confirmadas são histórico. Ordenar por nome misturaria as duas e faria a
 * pessoa procurar o que falta no meio do que já está feito.
 */
export function PreSmCidadesClient() {
  const t = useTranslations("PreSmCidades");
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  /**
   * A ESPERA PELA CARGA — o trabalho acontece no worker, e a tela não é avisada.
   *
   * Sem polling temporário, quem clicasse veria a lista igual e concluiria que a carga não fez nada.
   * Ele é LIGADO pelo clique e desligado sozinho: assim que a contagem muda, ou no teto de tempo.
   *
   * O teto existe porque a carga pode legitimamente não gravar nada — quando tudo já foi proposto
   * numa rodada anterior. Sem ele, esse caso giraria para sempre.
   */
  const [esperandoCarga, setEsperandoCarga] = useState(false);
  const contagemAoPedir = useRef<number | null>(null);

  const consulta = useQuery({
    queryKey: ["pre-sm-cidades"],
    queryFn: async () => {
      const res = await fetch("/api/admin/pre-sm-cidades");
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { items: CorrespondenciaDaCidade[] };
    },
    refetchInterval: esperandoCarga ? 3_000 : false,
  });

  /**
   * PEDIR A CARGA — é o que enche esta tela.
   *
   * Consulta os modelos na gerenciadora e propõe as correspondências, todas por conferir. Leitura
   * pura: não cria Pré-SM e não custa nada, e repetir não desfaz conferência de ninguém.
   *
   * O trabalho acontece no worker (a credencial vive só lá), então o botão PEDE — as linhas
   * aparecem quando ele terminar, e é por isso que a lista passa a ser recarregada por um tempo em
   * vez de uma vez só.
   */
  const carregar = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/pre-sm-cidades", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: () => {
      contagemAoPedir.current = consulta.data?.items.length ?? 0;
      setEsperandoCarga(true);
      avisar({ tipo: "ok", texto: t("cargaPedida") });
    },
    onError: () => avisar({ tipo: "erro", texto: t("cargaFalhou") }),
  });

  const definir = useMutation({
    mutationFn: async (v: { id: string; confirmar: boolean }) => {
      const res = await fetch("/api/admin/pre-sm-cidades", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ["pre-sm-cidades"] });
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
      [i.estacaoNorm, i.cidadeNome, i.uf, i.descricao].some((c) => c.toUpperCase().includes(termo)),
    );
  }, [itens, busca]);

  /**
   * DESLIGA A ESPERA quando a carga deu sinal — ou quando o tempo acabou.
   *
   * "Deu sinal" é a contagem mudar. Quando ela NÃO muda, o desfecho honesto é diferente e o texto
   * diz isso: a carga rodou e não achou nada de novo, que é o esperado numa segunda rodada — não é
   * falha, e chamar de falha faria alguém procurar defeito onde não há.
   */
  useEffect(() => {
    if (!esperandoCarga) return;
    if (contagemAoPedir.current != null && itens.length !== contagemAoPedir.current) {
      setEsperandoCarga(false);
      avisar({ tipo: "ok", texto: t("cargaChegou", { n: itens.length - contagemAoPedir.current }) });
      return;
    }
    const teto = setTimeout(() => {
      setEsperandoCarga(false);
      avisar({ tipo: "ok", texto: t("cargaSemNovidade") });
    }, 60_000);
    return () => clearTimeout(teto);
  }, [esperandoCarga, itens.length, t]);

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
          {/* A CARGA fica aqui, no topo, porque é o que faz a tela existir: sem ela não há linha
              nenhuma para conferir. É leitura pura na gerenciadora — não cria Pré-SM e não custa
              nada —, e por isso não pede confirmação. */}
          <Button
            type="button"
            variant="outline"
            className="ml-auto"
            disabled={carregar.isPending || esperandoCarga}
            onClick={() => carregar.mutate()}
          >
            {esperandoCarga ? t("carregando") : t("carregar")}
          </Button>
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
                <TableHead>{t("estacao")}</TableHead>
                
                <TableHead>{t("cidade")}</TableHead>
                <TableHead>{t("estado")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((i) => {
                const confirmada = i.confirmadoEm != null;
                return (
                  <TableRow key={i.id} className={cn(!confirmada && "bg-warning/5")}>
                    <TableCell className="font-medium">{i.estacaoNorm}</TableCell>
                    
                    {/* A descrição é como ELA escreve a cidade. É o que a pessoa compara com a estação à
                        esquerda para decidir se o casamento está certo — sem ela, a conferência
                        seria aprovar um número. */}
                    <TableCell>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">{i.codIbge}</span>{" "}
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
