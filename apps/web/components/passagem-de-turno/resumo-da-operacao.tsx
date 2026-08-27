"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { type Setor, type Turno, contadoresDo } from "@brazil-tms/shared";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * O RESUMO DA OPERAÇÃO — os contadores do topo de cada faixa (2026-08-26).
 *
 * ── O QUE ESTA TELA RESOLVE, E QUE A PLANILHA NÃO RESOLVE ─────────────────────────────────────
 *
 * Quatro destes números o TMS apura sozinho, e hoje alguém os conta à mão, de madrugada. Eles
 * aparecem já preenchidos, sem campo — não há o que digitar num número que o banco sabe.
 *
 * ── E QUANDO OS DOIS DISCORDAM ────────────────────────────────────────────────────────────────
 *
 * Quem está no turno pode saber de algo que o banco ainda não viu. Então o apurado também aceita
 * ser sobrescrito, e quando isso acontece a tela mostra OS DOIS: o digitado em tamanho grande, e o
 * do sistema riscado ao lado.
 *
 * Esconder o do sistema seria o caminho fácil e o errado — a divergência é justamente a informação
 * mais valiosa da tela, porque ou o banco está atrasado ou a pessoa se enganou, e nos dois casos
 * alguém precisa olhar. Um resumo que discorda do banco em silêncio é pior que resumo nenhum.
 */
export function ResumoDaOperacao({
  setor,
  turno,
  digitados,
  apurados,
  editavel,
  aoSalvar,
}: {
  setor: Setor;
  turno: Turno;
  digitados: Record<string, string>;
  apurados: Record<string, number>;
  editavel: boolean;
  aoSalvar: (chave: string, valor: string) => void;
}) {
  const t = useTranslations("PassagemTurno");
  const contadores = contadoresDo(setor, turno);

  return (
    <section aria-label={t("resumoDaOperacao")} className="rounded-lg border">
      <h3 className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("resumoDaOperacao")}
      </h3>
      <dl className="divide-y">
        {contadores.map((c) => {
          const apurado = apurados[c.chave];
          const digitado = digitados[c.chave] ?? "";
          const divergente =
            apurado !== undefined && digitado !== "" && digitado !== String(apurado);

          return (
            <div key={c.chave} className="flex items-center gap-3 px-3 py-1.5">
              <dt className="min-w-0 flex-1 text-sm">
                {c.rotulo}
                {/*
                  A PENDÊNCIA APARECE, e não fica só no código.

                  Um contador digitado que PODERIA ser apurado tem uma razão concreta para não ser,
                  e essa razão é interessante para quem preenche: explica por que ele conta à mão
                  este e não aquele. Sem isso, a divisão entre apurado e digitado pareceria
                  arbitrária — e o que parece arbitrário é o que as pessoas param de respeitar.
                */}
                {c.pendencia ? (
                  <span
                    className="ml-1 cursor-help text-muted-foreground"
                    title={t("aindaNaoApura", { motivo: c.pendencia })}
                    aria-label={t("aindaNaoApura", { motivo: c.pendencia })}
                  >
                    ⓘ
                  </span>
                ) : null}
              </dt>
              <dd className="flex shrink-0 items-center gap-2">
                {divergente ? (
                  <span
                    className="text-xs text-muted-foreground line-through tabular-nums"
                    title={t("oQueOTmsApurou")}
                  >
                    {apurado}
                  </span>
                ) : null}
                <CampoDoContador
                  chave={c.chave}
                  valor={digitado}
                  apurado={apurado}
                  editavel={editavel}
                  aoSalvar={aoSalvar}
                />
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/**
 * Um contador. Grava ao SAIR do campo, não a cada tecla.
 *
 * Salvar por tecla mandaria seis requisições para digitar "12" e ainda gravaria o "1" sozinho como
 * estado intermediário — que num contador de turno é um número errado que existiu de verdade no
 * banco, e que alguém poderia ler no meio do caminho.
 */
function CampoDoContador({
  chave,
  valor,
  apurado,
  editavel,
  aoSalvar,
}: {
  chave: string;
  valor: string;
  apurado: number | undefined;
  editavel: boolean;
  aoSalvar: (chave: string, valor: string) => void;
}) {
  const t = useTranslations("PassagemTurno");
  const [rascunho, setRascunho] = useState(valor);

  // O valor pode mudar por fora — outra pessoa do setor, ou o recarregamento do bloco.
  useEffect(() => setRascunho(valor), [valor]);

  if (!editavel) {
    const mostrar = valor !== "" ? valor : apurado !== undefined ? String(apurado) : "—";
    return <span className="w-16 text-right text-sm font-medium tabular-nums">{mostrar}</span>;
  }

  return (
    <Input
      value={rascunho}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={() => {
        if (rascunho !== valor) aoSalvar(chave, rascunho);
      }}
      /*
        O apurado vira PLACEHOLDER, e não valor inicial.

        Como valor inicial, o número do sistema seria gravado como digitado no primeiro clique fora
        do campo — e a partir daí congelaria, deixando de acompanhar o banco sem que ninguém
        notasse. Como placeholder ele informa sem se comprometer, e o campo vazio continua
        significando "vale o que o TMS apurou".
      */
      placeholder={apurado !== undefined ? String(apurado) : "—"}
      className={cn("h-7 w-16 text-right text-sm tabular-nums")}
      aria-label={t("valorDe", { chave })}
    />
  );
}
