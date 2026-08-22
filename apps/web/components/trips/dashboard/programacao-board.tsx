"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProgramacao } from "@/lib/trips/client";
import type { BlocoDaFrente } from "@brazil-tms/db";

/**
 * A PROGRAMAÇÃO POR FRENTE — o quadro branco da sala, em tela (2026-08-22, a pedido).
 *
 * Cada frente é uma faixa; os quatro blocos abrem PARA O LADO quando a faixa é aberta. O desenho é o
 * do quadro: região à esquerda, e a leitura correndo da esquerda para a direita na ordem do trabalho
 * — o que vem aí, o que apareceu em leilão, quem já devia estar na origem, e para onde a frente vai.
 *
 * ── O QUE FICA VISÍVEL COM TUDO FECHADO ────────────────────────────────────────────────────────
 *
 * O alarme. `ORIGEM` aparece na faixa mesmo fechada, e piscando quando há atraso — porque um alarme
 * que exige um clique para ser visto não é um alarme. O resto espera a pessoa abrir.
 *
 * ── POR QUE ABRE UMA DE CADA VEZ ───────────────────────────────────────────────────────────────
 *
 * São quatro frentes e quem trabalha cuida de uma. Todas abertas viram uma parede de vinte números
 * onde ninguém acha o seu; uma aberta é a que a pessoa escolheu olhar. A primeira já nasce aberta
 * para a tela não abrir vazia, pedindo um clique antes de dizer qualquer coisa.
 */

/** Os rótulos do quadro branco, não os do banco. `NONE` na tela pareceria "nenhuma". */
const NOME_DA_FRENTE: Record<string, string> = {
  NONE: "NO-NE",
  SUDESTE: "SUDESTE",
  SULCO: "CO-SU",
};

function nomeDaFrente(region: string | null, semRegiao: string): string {
  if (region === null) return semRegiao;
  return NOME_DA_FRENTE[region] ?? region;
}

/** Um número do bloco, com o rótulo miúdo em cima — o mesmo desenho dos cartões do painel. */
function Numero({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div className="min-w-[3.25rem] px-2">
      <p className="text-[0.6rem] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
        {rotulo}
      </p>
      <p
        className={`text-lg font-semibold tabular-nums leading-tight ${
          destaque && valor > 0 ? "text-destructive" : ""
        }`}
      >
        {valor}
      </p>
    </div>
  );
}

/** Um bloco do quadro: o título e os números dele, separado do vizinho por uma linha. */
function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-l pl-3 first:border-l-0 first:pl-0">
      <p className="px-2 text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </p>
      <div className="flex">{children}</div>
    </div>
  );
}

function Frente({
  bloco,
  aberta,
  onToggle,
}: {
  bloco: BlocoDaFrente;
  aberta: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("Trips.programacao");
  const atrasada = bloco.origemAtrasada > 0;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={aberta}
          className="flex min-w-[9.5rem] items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/60"
        >
          <ChevronRight
            aria-hidden
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${
              aberta ? "rotate-90" : ""
            }`}
          />
          <span className="text-sm font-semibold uppercase tracking-wide">
            {nomeDaFrente(bloco.region, t("semRegiao"))}
          </span>
        </button>

        {/**
         * O ALARME FICA FORA DA GAVETA.
         *
         * Ele é a única coisa que a pessoa precisa ver sem decidir olhar. Piscar é reservado a ele:
         * se tudo piscasse, nada chamaria atenção. `motion-reduce` desliga a animação para quem
         * pediu menos movimento — o vermelho e o número continuam dizendo a mesma coisa.
         */}
        {atrasada ? (
          <div className="flex items-center gap-2 self-center rounded-md bg-destructive/10 px-2.5 py-1 motion-safe:animate-pulse">
            <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-destructive">
              {t("origemAtrasada")}
            </span>
            <span className="text-lg font-semibold leading-none tabular-nums text-destructive">
              {bloco.origemAtrasada}
            </span>
          </div>
        ) : null}

        {/**
         * A GAVETA QUE ABRE PARA O LADO.
         *
         * `grid-template-columns` de 0fr para 1fr é o jeito de animar largura sem saber a largura —
         * `width: auto` não é animável, e fixar um valor em pixels quebraria assim que um número
         * passasse de dois dígitos. O `min-w-0` no filho é obrigatório: sem ele o conteúdo recusa
         * encolher e a gaveta abre de uma vez, sem transição.
         */}
        <div
          className={`grid transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none ${
            aberta ? "grid-cols-[1fr]" : "grid-cols-[0fr]"
          }`}
        >
          <div className="min-w-0 overflow-hidden">
            <div className="flex items-center gap-3 py-2.5 pl-3 pr-3">
              <Bloco titulo={t("plan")}>
                <Numero rotulo={t("h12")} valor={bloco.plan12h} />
                <Numero rotulo={t("h24")} valor={bloco.plan24h} />
              </Bloco>
              <Bloco titulo={t("spot")}>
                <Numero rotulo={t("aceito")} valor={bloco.spotAceito} />
                <Numero rotulo={t("naoAceito")} valor={bloco.spotNaoAceito} />
              </Bloco>
              <Bloco titulo={t("origem")}>
                <Numero rotulo={t("h2")} valor={bloco.origemAtrasada} destaque />
              </Bloco>
              <Bloco titulo={t("tendencia")}>
                <Numero rotulo={t("aceito")} valor={bloco.tendenciaAceito} />
                <Numero rotulo={t("naoAceito")} valor={bloco.tendenciaNaoAceito} />
              </Bloco>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function ProgramacaoBoard() {
  const t = useTranslations("Trips.programacao");
  const { data, isLoading } = useProgramacao();
  /**
   * `undefined` = ninguém escolheu ainda, e aí vale a primeira faixa. Guardar a REGIÃO e não o
   * índice: a ordem pode mudar entre duas leituras (uma frente sem viagem nenhuma some), e um índice
   * faria a gaveta pular para outra frente sozinha.
   */
  const [abertaPor, setAbertaPor] = useState<string | null | undefined>(undefined);

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-3">
            <Skeleton className="h-5 w-40" />
          </Card>
        ))}
      </div>
    );
  }

  const frentes = data?.frentes ?? [];
  if (frentes.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">{t("vazio")}</p>
      </Card>
    );
  }

  const chave = (b: BlocoDaFrente) => b.region ?? "__sem_regiao__";
  const primeira = chave(frentes[0]!);

  return (
    <div className="space-y-2">
      {frentes.map((bloco) => {
        const k = chave(bloco);
        const aberta = abertaPor === undefined ? k === primeira : abertaPor === k;
        return (
          <Frente
            key={k}
            bloco={bloco}
            aberta={aberta}
            // Clicar na aberta FECHA. Sem isso a única forma de fechar seria abrir outra, e uma
            // gaveta que não fecha é uma gaveta que a pessoa deixa de mexer.
            onToggle={() => setAbertaPor(aberta ? "__nenhuma__" : k)}
          />
        );
      })}
    </div>
  );
}
