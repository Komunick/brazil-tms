"use client";

import { useTranslations } from "next-intl";
import { useMelhoresMotoristas } from "@/lib/trips/client";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * QUEM JÁ ENTREGOU BEM NESTA ROTA — ao lado do campo, na hora de escalar (2026-08-23, a pedido).
 *
 * O ranking existia em Relatórios, e relatório se abre quando alguém lembra. A decisão acontece
 * aqui, no diálogo de atribuição, e é aqui que o número precisa estar.
 *
 * ── O QUE ELE NÃO FAZ ──────────────────────────────────────────────────────────────────────────
 *
 * Não escolhe. Não reordena a lista do campo. Não esconde ninguém. É uma sugestão ao lado, e a
 * pessoa que escala continua decidindo com o que o TMS não sabe: folga, região, carreta, quem
 * atendeu o telefone. Um painel que decide por você vira um painel que você aprende a ignorar
 * quando erra uma vez.
 *
 * Clicar num nome PREENCHE o campo, quando aquele motorista está na lista do portal. É atalho, não
 * decisão — o mesmo que digitar o nome, com menos chance de errar a letra. Quem não está na lista
 * do portal aparece como texto: ele rodou a rota no passado, mas não dá para escalá-lo daqui.
 *
 * ── E POR QUE O TEXTO DE EXPLICAÇÃO FICA JUNTO ─────────────────────────────────────────────────
 *
 * Porque um número sem régua é um número que cada um lê de um jeito. A frase diz em três linhas o
 * que a nota mede e por que ela não é o percentual — sem isso, a primeira pergunta de todo mundo vai
 * ser "por que o cara de 100% está embaixo?".
 */
export function MelhoresDaRota({
  tripId,
  aberto,
  opcoes,
  onEscolher,
}: {
  tripId: string;
  /** Só consulta com o diálogo aberto: ele fica montado atrás da lista da Expedição. */
  aberto: boolean;
  /** Os motoristas que o portal aceita — para casar o nome do ranking com o id do campo. */
  opcoes: { id: string; label: string }[];
  onEscolher: (driverId: string) => void;
}) {
  const t = useTranslations("Trips.melhoresDaRota");
  const query = useMelhoresMotoristas(tripId, aberto);

  /** O nome do ranking vem do portal, e a lista do campo também — casar por nome é o que existe. */
  const idPorNome = new Map(opcoes.map((o) => [o.label.trim().toLowerCase(), o.id]));
  const lista = query.data?.motoristas ?? [];

  return (
    <aside className="space-y-2 rounded-md border p-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("titulo")}
      </p>

      {query.isPending && aberto ? <Skeleton className="h-24 w-full" /> : null}

      {!query.isPending && lista.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("semHistorico")}</p>
      ) : null}

      {lista.length > 0 ? (
        <ul className="space-y-1.5">
          {lista.slice(0, 6).map((d) => {
            const id = idPorNome.get(d.motorista.trim().toLowerCase());
            const conteudo = (
              <>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-medium">{d.motorista}</span>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-semibold tabular-nums",
                      d.nota >= 90
                        ? "text-success"
                        : d.nota >= 80
                          ? "text-warning"
                          : "text-destructive",
                    )}
                  >
                    {d.nota}
                  </span>
                </span>
                <span className="block text-[0.68rem] text-muted-foreground">
                  {t("linha", { entregas: d.entregas, pct: d.pct })}
                  {d.emViagem ? ` · ${t("emViagem")}` : ""}
                </span>
              </>
            );
            return (
              <li key={d.motorista}>
                {id ? (
                  <button
                    type="button"
                    onClick={() => onEscolher(id)}
                    className="block w-full rounded px-1.5 py-1 text-left transition-colors hover:bg-muted"
                    title={t("usarEste")}
                  >
                    {conteudo}
                  </button>
                ) : (
                  <span className="block px-1.5 py-1 opacity-70">{conteudo}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* A régua, sempre visível: número sem régua cada um lê de um jeito. */}
      <p className="border-t pt-2 text-[0.66rem] leading-snug text-muted-foreground">
        {t("comoCalcula")}
      </p>
    </aside>
  );
}
