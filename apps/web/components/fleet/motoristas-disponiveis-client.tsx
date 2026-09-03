"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ShieldAlert } from "lucide-react";
import { estaLivre, formatDateTime } from "@brazil-tms/shared";
import type { MotoristaDisponivel } from "@brazil-tms/db";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

/**
 * A ABA DE MOTORISTAS DISPONÍVEIS (fatia 031, 03/09).
 *
 * ── UMA TABELA SÓ, e não dois blocos ──────────────────────────────────────────────────────────
 *
 * "Disponíveis" e "a caminho" poderiam virar dois blocos, e pareceria mais organizado. Mas quem
 * procura um nome teria de procurar em dois lugares, e a busca é justamente o gesto mais comum
 * aqui. A coluna de situação já separa visualmente, e uma tabela só é a forma da planilha que esta
 * aba substitui — o que permite comparar as duas lado a lado no dia da virada.
 *
 * ── A ORDEM PADRÃO NÃO É A DA PLANILHA, de propósito ──────────────────────────────────────────
 *
 * A planilha ordena por data de início porque é digitada em ordem de acontecimento — limitação de
 * quem digita, não decisão. Aqui a ordem padrão é por **conclusão mais antiga primeiro**: quem está
 * parado há mais tempo é quem precisa de carga antes.
 */
interface Resposta {
  motoristas: MotoristaDisponivel[];
  contagem: { disponiveis: number; aCaminho: number };
}

type Coluna = "nome" | "origem" | "destino" | "inicio" | "conclusao" | "situacao";

export function MotoristasDisponiveisClient() {
  const t = useTranslations("MotoristasDisponiveis");
  const tStatus = useTranslations("Trips.status");

  const consulta = useQuery({
    queryKey: ["motoristas-disponiveis"],
    queryFn: async () => {
      const res = await fetch("/api/fleet/motoristas-disponiveis");
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as Resposta;
    },
    /*
      SESSENTA SEGUNDOS, e sem atualizar em segundo plano.

      O cartão de oferta de spot relê de 5 em 5 segundos porque lá se disputa uma carga contra outra
      transportadora. Aqui não há corrida: o plano do portal é lido de 20 em 20 segundos pelo robô, e
      um motorista não fica livre entre um segundo e outro.

      Sem `refetchIntervalInBackground` porque **não há nada a avisar** — ninguém precisa ser
      interrompido porque um caminhão chegou. A aba fica aberta o turno inteiro; um minuto é mais
      fresco que a planilha em qualquer cenário e custa 11 ms de consulta por minuto.
    */
    refetchInterval: 60_000,
  });

  /*
    BUSCA E ORDENAÇÃO SÃO ESTADO DA TELA, nunca parâmetro da consulta.

    Mandá-las ao servidor faria a lista recarregar a cada tecla e trocar o resultado debaixo de quem
    digita. Aqui a atualização de um minuto troca os dados sob a tabela sem mexer no que a pessoa
    escreveu nem na coluna que ela escolheu.
  */
  const [busca, setBusca] = useState("");
  const [coluna, setColuna] = useState<Coluna>("conclusao");
  const [crescente, setCrescente] = useState(true);

  const motoristas = consulta.data?.motoristas ?? [];

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrados = termo
      ? motoristas.filter((m) =>
          [m.nome, m.origem, m.destino, m.cavalo, m.carreta]
            .filter(Boolean)
            .some((campo) => String(campo).toLowerCase().includes(termo)),
        )
      : motoristas;

    const peso = (m: MotoristaDisponivel): string => {
      switch (coluna) {
        case "nome":
          return m.nome;
        case "origem":
          return m.origem;
        case "destino":
          return m.destino;
        case "inicio":
          return m.inicio ?? "";
        case "situacao":
          return m.situacao;
        default:
          return m.conclusao;
      }
    };

    return [...filtrados].sort((a, b) => {
      const r = peso(a).localeCompare(peso(b), "pt-BR");
      return crescente ? r : -r;
    });
  }, [motoristas, busca, coluna, crescente]);

  if (consulta.isLoading) return <Skeleton className="h-96 w-full" />;

  if (consulta.isError) {
    return (
      <Card>
        <CardContent className="text-destructive py-10 text-center text-sm">
          {t("erro")}
        </CardContent>
      </Card>
    );
  }

  const ordenarPor = (c: Coluna): void => {
    if (c === coluna) setCrescente(!crescente);
    else {
      setColuna(c);
      setCrescente(true);
    }
  };

  const Cabecalho = ({ c }: { c: Coluna }) => (
    <TableHead>
      <button
        type="button"
        className="hover:text-foreground inline-flex items-center gap-1"
        onClick={() => ordenarPor(c)}
      >
        {t(`coluna.${c}`)}
        {coluna === c ? (
          crescente ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : null}
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={t("buscar")}
          className="max-w-sm"
        />
        {/*
          AS DUAS CONTAGENS À VISTA, para o total ser conferível sem contar linha por linha.

          Elas vêm do servidor e descrevem a LISTA INTEIRA, não o que a busca deixou na tela: são a
          resposta a "como está a frota agora", e mudá-las conforme o filtro faria a pergunta virar
          outra no meio da digitação.
        */}
        <Badge variant="secondary">
          {t("disponiveis", { n: consulta.data?.contagem.disponiveis ?? 0 })}
        </Badge>
        <Badge variant="outline">
          {t("aCaminho", { n: consulta.data?.contagem.aCaminho ?? 0 })}
        </Badge>
      </div>

      {visiveis.length === 0 ? (
        /* Vazio em palavras, nunca uma tabela sem linhas — e a frase distingue "não há ninguém" de
           "a sua busca não achou", que pedem coisas diferentes de quem lê. */
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            {motoristas.length === 0 ? t("vazio") : t("vazioBusca")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <Cabecalho c="nome" />
                  <Cabecalho c="origem" />
                  <Cabecalho c="destino" />
                  <Cabecalho c="inicio" />
                  <Cabecalho c="conclusao" />
                  <TableHead>{t("coluna.cavalo")}</TableHead>
                  <TableHead>{t("coluna.carreta")}</TableHead>
                  <Cabecalho c="situacao" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((m) => (
                  <TableRow key={m.driverId}>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        {m.nome}
                        {/*
                          O SELO DE IMPEDIDO, e o motorista CONTINUA na lista.

                          Esconder faria o nome sumir sem explicação, e ninguém iria consertar o
                          cadastro. Marcado, quem lê vê que ele existe e por que a atribuição vai
                          recusar — eram 4 dos 36 finalizados de hoje e ontem.
                        */}
                        {m.impedimento ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-400"
                            title={`${t(`impedimento.${m.impedimento.motivo}`)}${
                              m.impedimento.detalhe ? ` — ${m.impedimento.detalhe}` : ""
                            } ${t("impedimento.aviso")}`}
                          >
                            <ShieldAlert className="size-3" />
                            {t("impedido")}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{m.origem}</TableCell>
                    <TableCell>{m.destino}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(m.inicio)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link href={`/trips/${m.tripId}`} className="hover:underline">
                        {formatDateTime(m.conclusao)}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono">{m.cavalo ?? "—"}</TableCell>
                    {/*
                      CARRETA VAZIA FICA VAZIA — nunca a placa do cavalo repetida.

                      É o erro que já aconteceu neste projeto ao copiar placas, e o sintoma é uma
                      composição que parece existir e não existe.
                    */}
                    <TableCell className="font-mono">
                      {m.carreta ?? (
                        <span className="text-muted-foreground/60 font-sans text-xs italic">
                          {t("semCarreta")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Situacao m={m} t={t} tStatus={tStatus} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * A COLUNA QUE RESPONDE "POSSO DAR CARGA?".
 *
 * FINALIZADO é a palavra que a operação já usa para "está livre". CANCELADA precisa ser distinta
 * porque o motorista está livre do mesmo jeito, mas a carga **não foi entregue** — juntar as duas
 * faria a tela afirmar uma entrega que não houve.
 *
 * O "a caminho" usa o catálogo de status que a Torre de Controle já tem. Um segundo catálogo aqui
 * divergiria dele no primeiro status novo, e a mesma viagem teria dois nomes em duas telas.
 */
function Situacao({
  m,
  t,
  tStatus,
}: {
  m: MotoristaDisponivel;
  t: ReturnType<typeof useTranslations<"MotoristasDisponiveis">>;
  tStatus: ReturnType<typeof useTranslations<"Trips.status">>;
}) {
  if (!estaLivre(m.situacao)) {
    return (
      <Badge variant="outline" className="whitespace-nowrap">
        {tStatus.has(m.statusDaViagem) ? tStatus(m.statusDaViagem) : m.statusDaViagem}
      </Badge>
    );
  }

  return (
    <Badge
      className={cn(
        "whitespace-nowrap",
        m.situacao === "finalizado"
          ? "bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-500"
          : "bg-muted text-muted-foreground hover:bg-muted",
      )}
    >
      {t(`situacao.${m.situacao}`)}
    </Badge>
  );
}
