"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { History } from "lucide-react";
import { normalizarPlaca } from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PlacaSugerida {
  placa: string;
  vezes: number;
  ultimaEm: string | null;
  ultimaRota: string | null;
  /** `carreta`, `truck`, `toco`… ou nulo quando o cadastro não sabe. Ver `placasDoMotorista`. */
  tipo: string | null;
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
  escolhidas,
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
  /**
   * As placas que JÁ ESTÃO nos campos do formulário — aparecem marcadas.
   *
   * Nasceu do defeito de 31/08: clicar numa sugestão já escolhida não faz nada (de propósito, para
   * não desmarcar sem querer), e sem uma marca isso é indistinguível de a tela ter travado. Com
   * ela, o "não aconteceu nada" passa a se explicar sozinho — já estava lá.
   */
  escolhidas?: readonly string[];
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
  // Mesma normalização, mesmo motivo: `ABC-1D23` no campo e `ABC1D23` na sugestão são a mesma placa,
  // e comparar cru deixaria de marcar justamente as que estão escolhidas.
  const jaNoFormulario = new Set((escolhidas ?? []).map(normalizarPlaca));

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
            /*
              A MARCA É A BORDA, não uma cor de fundo forte: a tira fica logo acima dos campos, e um
              destaque competindo com eles trocaria o problema de lugar. Aqui ela só responde "esta
              já está escolhida" — quem manda continua sendo o campo.

              `aria-pressed` junto, porque a borda sozinha não chega a quem usa leitor de tela.
            */
            className={cn(
              "h-7 font-mono text-xs",
              jaNoFormulario.has(normalizarPlaca(p.placa)) && "border-primary bg-primary/10",
            )}
            aria-pressed={jaNoFormulario.has(normalizarPlaca(p.placa))}
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
            {/**
             * O TIPO AO LADO DA PLACA (2026-08-28, a pedido).
             *
             * Uma viagem carrega cavalo e carreta juntos, e sem isto a tira de sugestões é uma pilha
             * de códigos onde quem escala precisa reconhecer de cabeça qual é qual — que é
             * exatamente o passo em que o erro entra.
             *
             * ABREVIADO, porque o espaço é de um botão: "CARR", "TRUCK". O nome inteiro fica no
             * `title`, junto do resto do contexto.
             *
             * SOME QUANDO NÃO SE SABE — 15% das placas não estão em nenhum dos dois cadastros, e um
             * rótulo chutado seria pior que rótulo nenhum: quem confia nele uma vez confia sempre.
             */}
            {p.tipo ? (
              <span className="ml-1 rounded bg-muted px-1 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {abreviar(p.tipo)}
              </span>
            ) : null}
            {p.vezes > 1 ? (
              <span className="ml-1 text-muted-foreground tabular-nums">×{p.vezes}</span>
            ) : null}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * O tipo do cadastro, curto o bastante para caber ao lado da placa.
 *
 * Os valores vêm do enum do banco (`carreta`, `truck`, `toco`, `tres_quartos`, `van`, `vuc`), e o
 * que não estiver no mapa aparece como veio, em maiúsculas: um tipo novo no cadastro deve
 * APARECER, mesmo feio, em vez de sumir por não ter tradução.
 */
const ABREVIACAO: Record<string, string> = {
  // CARRETA é o reboque; CAVALO é quem puxa. Escrever "CARR" no cavalo foi o erro de 28/08 —
  // ver o comentário de `tipo` em `placasDoMotorista`.
  carreta: "CARRETA",
  cavalo: "CAVALO",
  truck: "TRUCK",
  toco: "TOCO",
  tres_quartos: "3/4",
  van: "VAN",
  vuc: "VUC",
};

function abreviar(tipo: string): string {
  return ABREVIACAO[tipo] ?? tipo.replace(/_/g, " ").toUpperCase();
}

/** `ABC1D23 · carreta · 12 viagens · SIMÕES → JABOATÃO, 24/08` — o que o `title` mostra. */
function detalhe(p: PlacaSugerida, t: (k: string, v?: Record<string, string>) => string): string {
  const partes = [p.placa];
  // O tipo por extenso aqui, e abreviado no botão: no `title` há espaço, e "carreta" lê melhor.
  if (p.tipo) partes.push(p.tipo.replace(/_/g, " "));
  partes.push(t("timesUsed", { n: String(p.vezes) }));
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
