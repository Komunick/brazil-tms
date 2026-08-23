"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import {
  useAcompanharViagem,
  useMinhaProgramacao,
  usePararDeAcompanhar,
  useTripBoard,
} from "@/lib/trips/client";
import { TripStatusBadge } from "@/components/trips/trip-status-badge";
import type { TripDisplayStatus } from "@brazil-tms/shared";
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

/**
 * MINHA PROGRAMAÇÃO — as viagens que ESTA pessoa está acompanhando (2026-08-23, a pedido).
 *
 * A Torre mostra as milhares; a Expedição mostra a fila do dia. Faltava o recorte pessoal: as cinco
 * ou dez LHs que alguém está acompanhando agora, com o telefone do motorista à mão para poder ligar.
 *
 * ── A BUSCA NÃO ENTREGA UMA LISTA PRONTA ───────────────────────────────────────────────────────
 *
 * São milhares de viagens: um seletor com todas seria uma lista impossível de percorrer, e uma lista
 * "sugerida" seria o sistema adivinhando o que a pessoa quer acompanhar. Ela digita o LH — que é
 * como a operação se refere à viagem, e o número que ela tem em mãos quando decide acompanhar.
 *
 * ── O TELEFONE, QUANDO NÃO ACHA, DIZ QUE NÃO ACHOU ─────────────────────────────────────────────
 *
 * O contato vem do cadastro de motoristas, casado pelo NOME que o portal manda — a única chave que
 * os dois lados compartilham. Medido: 107 de 110 viagens ativas casam, e 97 têm telefone. Onde não
 * casa, a linha mostra o nome e um traço no contato. Esconder a viagem seria pior, e inventar um
 * número seria muito pior.
 */
export function MinhaProgramacaoClient() {
  const t = useTranslations("Programacao");
  const lista = useMinhaProgramacao();
  const acompanhar = useAcompanharViagem();
  const parar = usePararDeAcompanhar();

  const [termo, setTermo] = useState("");
  const busca = termo.trim();

  /**
   * Só busca com três caracteres: um LH tem treze, e procurar por "L" varreria o banco inteiro para
   * devolver uma lista que não ajuda ninguém.
   */
  const resultados = useTripBoard(
    busca.length >= 3 ? `q=${encodeURIComponent(busca)}&scope=all&limit=8&sort=pickupStart` : "",
  );

  const jaNaLista = useMemo(
    () => new Set((lista.data?.viagens ?? []).map((v) => v.tripId)),
    [lista.data],
  );

  const viagens = lista.data?.viagens ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="space-y-1.5">
            <label htmlFor="buscar-lh" className="text-sm font-medium">
              {t("adicionar")}
            </label>
            <Input
              id="buscar-lh"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder={t("adicionarPlaceholder")}
              className="max-w-md"
            />
          </div>

          {busca.length >= 3 ? (
            <div className="space-y-1">
              {resultados.isPending ? <Skeleton className="h-16 w-full max-w-md" /> : null}
              {!resultados.isPending && (resultados.data?.items.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">{t("nadaEncontrado")}</p>
              ) : null}
              {(resultados.data?.items ?? []).map((linha) => (
                <div
                  key={linha.id}
                  className="flex max-w-2xl flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="font-mono text-sm">{linha.externalTripId ?? "—"}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {linha.originName} → {linha.destinationName}
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={jaNaLista.has(linha.id) ? "ghost" : "outline"}
                    disabled={jaNaLista.has(linha.id) || acompanhar.isPending}
                    onClick={() => acompanhar.mutate(linha.id)}
                  >
                    {jaNaLista.has(linha.id) ? (
                      t("jaAcompanha")
                    ) : (
                      <>
                        <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                        {t("acompanhar")}
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {lista.isPending ? <Skeleton className="h-40 w-full" /> : null}

          {!lista.isPending && viagens.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("vazio")}</p>
          ) : null}

          {viagens.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("lh")}</TableHead>
                  <TableHead>{t("rota")}</TableHead>
                  <TableHead>{t("coleta")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("motorista")}</TableHead>
                  <TableHead>{t("placa")}</TableHead>
                  <TableHead>{t("contato")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {viagens.map((v) => (
                  <TableRow key={v.tripId}>
                    <TableCell className="font-mono text-xs">{v.externalTripId ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {v.origem ?? "—"}
                      <span className="px-1 text-muted-foreground">→</span>
                      {v.destino ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">
                      {v.coleta ?? "—"}
                    </TableCell>
                    <TableCell>
                      <TripStatusBadge
                        status={v.status as TripDisplayStatus}
                        portalAcceptance={v.acceptanceStatus}
                        portalStatus={v.portalStatus}
                      />
                    </TableCell>
                    <TableCell className="text-xs">{v.motorista ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {v.placa ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {/* Discar no celular, copiar no computador — o `tel:` faz as duas sem pedir nada. */}
                      {v.telefone ? (
                        <a className="underline underline-offset-2" href={`tel:${v.telefone}`}>
                          {v.telefone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{t("semContato")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        title={t("remover")}
                        disabled={parar.isPending}
                        onClick={() => parar.mutate(v.tripId)}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                        <span className="sr-only">{t("remover")}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
