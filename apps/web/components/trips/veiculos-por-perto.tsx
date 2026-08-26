"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Truck } from "lucide-react";
import { ufECidadeDaEstacao } from "@brazil-tms/shared";
import { useFrotaComPosicao } from "@/lib/trips/client";
import { MapaDePosicoes, type PontoNoMapa } from "@/components/fleet/mapa-de-posicoes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * OS VEÍCULOS PERTO DA ORIGEM — a informação na hora de escalar (2026-08-26, a pedido).
 *
 * Veio de uma tela do eTorre que o usuário mostrou: ao programar veículo, a gerenciadora lista os
 * disponíveis com a DISTÂNCIA ATÉ A ORIGEM ao lado, e um mapa. É informação no momento da decisão,
 * que é o melhor tipo — e era o que faltava aqui.
 *
 * ── CASA POR CIDADE, E NÃO POR DISTÂNCIA — por enquanto ───────────────────────────────────────
 *
 * A tela deles ordena por quilômetros. Nós ainda não conseguimos: medido em 26/08, das 459 estações
 * cadastradas **nenhuma** tem latitude e longitude — as colunas existem e estão todas vazias,
 * inclusive nas 52 que são origem de viagem. Sem a coordenada da origem não há distância a calcular.
 *
 * O que dá para fazer hoje, e resolve o caso comum: a estação carrega UF e cidade no NOME
 * (`SOC_SP_GUARULHOS`), e o `getPosicoes` devolve cidade e UF de cada veículo. Casar os dois
 * responde "quem está na cidade da coleta agora", que é a pergunta de 90% das escalas.
 *
 * Quando as estações ganharem coordenada, isto vira ordenação por km sem mudar mais nada na tela —
 * a lista já está aqui, e só o critério muda.
 *
 * ── E O MAPA MOSTRA TODOS, não só os da cidade ────────────────────────────────────────────────
 *
 * De propósito. A lista responde "quem serve"; o mapa responde "e o resto, onde está?" — que é como
 * alguém descobre que há um caminhão a uma hora dali, na cidade vizinha, que a regra de cidade não
 * pegou. Esconder o resto tornaria o mapa uma segunda cópia da lista.
 */
export function VeiculosPorPerto({
  origem,
  aoEscolherPlaca,
}: {
  /** O nome da estação de origem, como o portal manda: `SOC_SP_GUARULHOS`. */
  origem: string | null;
  aoEscolherPlaca?: (placa: string) => void;
}) {
  const t = useTranslations("Trips.portalAssign");
  const [aberto, setAberto] = useState(false);
  const frota = useFrotaComPosicao();

  const alvo = useMemo(() => ufECidadeDaEstacao(origem), [origem]);

  const { perto, todos } = useMemo(() => {
    const lista = frota.data?.veiculos ?? [];
    const pontos: PontoNoMapa[] = lista.map((v) => ({
      id: v.placa,
      latitude: v.latitude,
      longitude: v.longitude,
      titulo: v.placa,
      detalhe: [
        v.motorista ?? v.cpfMotorista ?? null,
        v.cidade ? `${v.cidade}/${v.uf ?? ""}` : null,
        v.minutos == null ? null : t("minutosAtras", { n: v.minutos }),
      ]
        .filter(Boolean)
        .join(" · "),
    }));

    if (!alvo.cidade) return { perto: [], todos: pontos };

    /**
     * `normalizarEstacao` já rodou dos dois lados? NÃO — e é aqui que o cuidado mora.
     *
     * `ufECidadeDaEstacao` devolve a cidade já normalizada (maiúsculas, sem acento). A cidade que
     * vem do rastreador é crua: "JABOATAO DOS GUARARAPES", "SIMOES FILHO". Comparar sem normalizar
     * a segunda faria "São Paulo" nunca casar com "SAO PAULO", e o painel abriria sempre vazio sem
     * dar pista nenhuma do motivo.
     */
    const dela = (s: string | null) =>
      String(s ?? "")
        .toUpperCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim();

    const naCidade = lista.filter(
      (v) => dela(v.cidade) === alvo.cidade && (!alvo.uf || dela(v.uf) === alvo.uf),
    );
    return {
      perto: naCidade,
      todos: pontos.map((p) => ({
        ...p,
        destaque: naCidade.some((v) => v.placa === p.id),
      })),
    };
  }, [frota.data, alvo, t]);

  // Sem origem não há o que dizer, e um painel vazio é ruído.
  if (!origem) return null;

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50"
      >
        <Truck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="font-medium">{t("veiculosPorPerto")}</span>
        {frota.isPending ? (
          <span className="text-muted-foreground">{t("carregandoFrota")}</span>
        ) : (
          <span className="text-muted-foreground">
            {perto.length > 0
              ? t("naCidadeDaColeta", { n: perto.length, cidade: alvo.cidade })
              : t("nenhumNaCidade", { cidade: alvo.cidade || "—" })}
          </span>
        )}
        <span className="ml-auto text-muted-foreground">{aberto ? "−" : "+"}</span>
      </button>

      {aberto ? (
        <div className="space-y-2 border-t p-3">
          {perto.length > 0 ? (
            <ul className="space-y-1">
              {perto.map((v) => (
                <li key={v.placa} className="flex items-center gap-2 text-xs">
                  <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="font-mono font-medium">{v.placa}</span>
                  <span className="truncate text-muted-foreground">
                    {v.motorista ?? v.cpfMotorista ?? t("semMotoristaVinculado")}
                  </span>
                  {/* A IDADE DA POSIÇÃO é o que decide se ela vale: um caminhão "em Guarulhos"
                      há seis horas pode estar em Curitiba agora. */}
                  {v.minutos == null ? null : (
                    <span
                      className={cn(
                        "ml-auto shrink-0 tabular-nums",
                        v.minutos > 120 ? "text-amber-600" : "text-muted-foreground",
                      )}
                    >
                      {t("minutosAtras", { n: v.minutos })}
                    </span>
                  )}
                  {aoEscolherPlaca ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 shrink-0 px-2 text-[11px]"
                      onClick={() => aoEscolherPlaca(v.placa)}
                    >
                      {t("usarEstaPlaca")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("nenhumNaCidadeExplicacao", { cidade: alvo.cidade || "—" })}
            </p>
          )}

          {todos.length > 0 ? (
            <MapaDePosicoes pontos={todos} altura="18rem" aoClicar={aoEscolherPlaca} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
