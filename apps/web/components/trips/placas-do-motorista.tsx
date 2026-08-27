"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { History } from "lucide-react";
import { normalizarPlaca } from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";

interface PlacaSugerida {
  placa: string;
  vezes: number;
  ultimaEm: string | null;
  ultimaRota: string | null;
}

/**
 * AS PLACAS QUE ESTE MOTORISTA JÁ RODOU (2026-08-27, a pedido).
 *
 * Escolher o motorista e depois caçar a placa é o passo onde o erro entra: são 936 placas na lista,
 * e a certa quase sempre é uma que ele já usou. Isto responde "quais?" sem ninguém precisar lembrar.
 *
 * ── SUGERE, NÃO PREENCHE ──────────────────────────────────────────────────────────────────────
 *
 * Foi o pedido, e é o certo: *"nada fixo, aparece meio que um popup ao lado avisando as placas que
 * ele usou"*. O caminhão de ontem não é o caminhão de hoje, e um campo que se preenche sozinho é um
 * campo que ninguém confere. Aqui a pessoa clica — e o clique é o registro de que ela olhou.
 *
 * ── APARECE E SOME COM O MOTORISTA ────────────────────────────────────────────────────────────
 *
 * Sem motorista escolhido, não há o que sugerir e o painel não existe. Sem histórico, também não —
 * um bloco dizendo "nada encontrado" ocuparia espaço permanente no diálogo para informar uma
 * ausência que não muda decisão nenhuma. O primeiro caminhão de um motorista novo é digitado, como
 * sempre foi.
 */
export function PlacasDoMotorista({
  driverId,
  aoEscolher,
  apenas,
}: {
  /**
   * A chave do motorista, nas DUAS formas que o TMS tem: o id numérico do portal (diálogo da
   * Expedição e da Minha Programação) ou o UUID do nosso cadastro (atribuição interna da Torre de
   * Controle). Quem resolve uma na outra é a consulta.
   */
  driverId: string;
  /** Recebe a placa clicada. Quem decide o que fazer com ela é quem chamou. */
  aoEscolher: (placa: string) => void;
  /**
   * Quando presente, só mostra as placas que estão nesta lista.
   *
   * Existe para a atribuição interna, cujo campo escolhe um VEÍCULO DO CADASTRO. Uma placa que veio
   * de uma ordem do portal e não está na nossa frota não pode ser selecionada ali — e um botão que
   * não faz nada ao ser clicado é pior que a ausência dele.
   *
   * O diálogo do portal não passa nada: lá o campo é livre, e qualquer placa serve.
   */
  apenas?: readonly string[];
}) {
  const t = useTranslations("Trips.portalAssign");

  const consulta = useQuery({
    queryKey: ["placas-do-motorista", driverId],
    queryFn: async () => {
      const res = await fetch(
        `/api/trips/placas-do-motorista?driverId=${encodeURIComponent(driverId)}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { placas: PlacaSugerida[] };
    },
    /**
     * Só pergunta quando há motorista — `enabled` em vez de um `if` antes do hook, porque hook não
     * pode ser condicional e trocar de motorista precisa refazer a consulta.
     *
     * O histórico de noventa dias não muda enquanto o diálogo está aberto: `staleTime` alto evita
     * uma consulta a cada reabertura do mesmo motorista, que é o padrão de quem corrige uma placa.
     */
    enabled: driverId.trim() !== "",
    staleTime: 5 * 60_000,
  });

  /**
   * O filtro compara NORMALIZADO, e não texto cru.
   *
   * A placa vem do portal como `ABC1D23` e o cadastro pode guardá-la como `ABC-1D23`. Comparar
   * literalmente esconderia justamente as placas que existem nos dois lados — que são todas as que
   * importam aqui.
   */
  const todas = consulta.data?.placas ?? [];
  const permitidas = apenas ? new Set(apenas.map(normalizarPlaca)) : null;
  const placas = permitidas ? todas.filter((p) => permitidas.has(normalizarPlaca(p.placa))) : todas;

  if (driverId.trim() === "" || placas.length === 0) return null;

  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-2">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <History className="h-3.5 w-3.5" aria-hidden />
        {t("platesUsedBefore")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {placas.map((p) => (
          <Button
            key={p.placa}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 font-mono text-xs"
            onClick={() => aoEscolher(p.placa)}
            /*
              O CONTEXTO VAI NO `title`, e não em texto solto na tela.

              "ABC1D23 · 12 viagens · última em SIMÕES → JABOATÃO, 24/08" é a informação que decide
              entre duas placas parecidas — mas escrita por extenso ao lado de cada uma, ela
              transformaria uma tira de sugestões em um parágrafo, dentro de um diálogo que já pede
              motorista, vínculo e três placas.
            */
            title={detalhe(p, t)}
          >
            {p.placa}
            {p.vezes > 1 ? (
              <span className="ml-1 text-muted-foreground tabular-nums">×{p.vezes}</span>
            ) : null}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** `ABC1D23 · 12 viagens · SIMÕES → JABOATÃO, 24/08` — o que o `title` mostra ao pousar o mouse. */
function detalhe(p: PlacaSugerida, t: (k: string, v?: Record<string, string>) => string): string {
  const partes = [p.placa, t("timesUsed", { n: String(p.vezes) })];
  if (p.ultimaRota) partes.push(p.ultimaRota);
  if (p.ultimaEm) {
    /*
     * Formatado em São Paulo, e não pelo relógio de quem abriu: o diálogo é usado por gente em
     * turnos diferentes, e uma data que muda de dia conforme o navegador é pior que data nenhuma.
     */
    const d = new Date(p.ultimaEm);
    if (!Number.isNaN(d.getTime())) {
      partes.push(
        d.toLocaleDateString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
        }),
      );
    }
  }
  return partes.join(" · ");
}
