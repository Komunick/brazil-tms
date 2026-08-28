"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Truck } from "lucide-react";
import { chaveDaEstacao, distanciaKm, ufECidadeDaEstacao } from "@brazil-tms/shared";
import { useEstacoesComCoordenada, useFrotaComPosicao } from "@/lib/trips/client";
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
  /**
   * OS DOIS CONTROLES QUE A TELA DELES TEM (2026-08-26, a pedido).
   *
   * O raio nasce em 150 km, e não no máximo: a pergunta que este painel responde é "quem está
   * PERTO", e abrir em 300 encheria a lista de caminhões que ninguém vai chamar. Quem precisar de
   * mais arrasta.
   *
   * "Só livres" nasce LIGADO porque é o caso normal — quem está montando o dia procura quem pode
   * atender. Desligar mostra os ocupados junto, para quando se quer ver a frota inteira.
   */
  const [raioKm, setRaioKm] = useState(150);
  const [soLivres, setSoLivres] = useState(true);
  /**
   * QUAL VEÍCULO O MAPA ESTÁ MOSTRANDO (2026-08-28, a pedido).
   *
   * A lista e o mapa eram duas coisas lado a lado: clicar numa linha destacava um ponto que podia
   * estar fora do enquadramento, e a pessoa tinha de caçá-lo. Agora o clique manda o mapa voar até
   * ele e abrir o balão.
   *
   * O ESTADO MORA AQUI, e não no mapa: é a lista que sabe quem foi clicado, e assim o mapa continua
   * um componente burro que recebe um id e obedece.
   */
  const [focado, setFocado] = useState<string | null>(null);
  const frota = useFrotaComPosicao();
  const estacoes = useEstacoesComCoordenada();

  /**
   * A COORDENADA DA ORIGEM, quando ela já foi descoberta.
   *
   * Casada pela CHAVE (`BA SIMOES FILHO`) e não pelo id da estação, de propósito: o mesmo pátio
   * aparece com grafias diferentes no cadastro (`SOC SOC_BA_Simões Filho` e `SoC_BA_Simoes Filho`
   * são a mesma coisa), e casar por id perderia a coordenada de todas menos uma.
   */
  const daOrigem = useMemo(() => {
    const chave = chaveDaEstacao(origem);
    if (!chave) return null;
    const e = (estacoes.data?.estacoes ?? []).find((x) => chaveDaEstacao(x.nome) === chave);
    return e ? { lat: e.latitude, lon: e.longitude } : null;
  }, [estacoes.data, origem]);

  const alvo = useMemo(() => ufECidadeDaEstacao(origem), [origem]);

  const { perto, todos } = useMemo(() => {
    const lista = frota.data?.veiculos ?? [];
    const pontos: PontoNoMapa[] = lista.map((v) => ({
      id: v.placa,
      latitude: v.latitude,
      longitude: v.longitude,
      titulo: v.placa,
      estado: estadoDoVeiculo(v),
      /*
       * O BALÃO, uma linha por informação (2026-08-28, a pedido).
       *
       * Era tudo numa linha só, separado por pontos, e o pedido foi ver "as informações que a Logae
       * fala ao clicar no ícone dele". A ordem é a da pergunta: quem dirige, está andando?, onde, e
       * de quando é isso — porque uma posição de três horas atrás muda o valor de todo o resto.
       *
       * Linha ausente SOME, não vira travessão: metade dos campos não vem em metade dos veículos, e
       * uma pilha de traços empurraria para fora do balão as três que interessam.
       */
      linhas: [
        v.motorista ?? (v.cpfMotorista ? t("cpf", { cpf: v.cpfMotorista }) : null),
        textoDoEstado(v, t),
        v.cidade ? `${v.cidade}${v.uf ? `/${v.uf}` : ""}` : null,
        v.referencia,
        v.emViagem ? t("emViagemNa", { lh: v.emViagem }) : t("livre"),
        v.minutos == null ? null : t("minutosAtras", { n: v.minutos }),
      ].filter((x): x is string => Boolean(x)),
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

    /**
     * COM COORDENADA, ORDENA POR DISTÂNCIA. Sem ela, casa por cidade.
     *
     * As duas respostas servem, e a diferença precisa aparecer na tela: "está na cidade da coleta" e
     * "está a 25 km" são afirmações de força diferente, e quem escala precisa saber qual está lendo.
     *
     * O raio de 300 km é generoso de propósito — é para ORDENAR, não para excluir. Quem está a 280
     * km raramente serve, mas ver que ele existe é melhor que uma lista vazia que não explica nada.
     */
    /**
     * O FILTRO DE LIVRES VEM ANTES DO DE DISTÂNCIA, e a ordem importa para o que se lê.
     *
     * Um caminhão a 25 km EM VIAGEM não serve, e um a 39 km livre serve. Filtrando primeiro, o
     * "3 a menos de 150 km" do cabeçalho conta quem PODE atender — que é o número que a pessoa usa
     * para decidir se procura mais longe ou liga para alguém.
     */
    const disponiveis = soLivres ? lista.filter((v) => !v.emViagem) : lista;

    const naCidade = daOrigem
      ? disponiveis
          .map((v) => ({ v, km: distanciaKm(daOrigem, { lat: v.latitude, lon: v.longitude }) }))
          .filter((x) => x.km <= raioKm)
          .sort((a, b) => a.km - b.km)
          .map((x) => ({ ...x.v, km: x.km }))
      : disponiveis
          .filter((v) => dela(v.cidade) === alvo.cidade && (!alvo.uf || dela(v.uf) === alvo.uf))
          .map((v) => ({ ...v, km: null as number | null }));
    return {
      perto: naCidade,
      todos: pontos.map((p) => ({
        ...p,
        destaque: naCidade.some((v) => v.placa === p.id),
      })),
    };
  }, [frota.data, alvo, daOrigem, raioKm, soLivres, t]);

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
            {perto.length === 0
              ? t("nenhumNaCidade", { cidade: alvo.cidade || "—" })
              : daOrigem
                ? t("aMenosDeKm", { n: perto.length, km: raioKm })
                : t("naCidadeDaColeta", { n: perto.length, cidade: alvo.cidade })}
          </span>
        )}
        <span className="ml-auto text-muted-foreground">{aberto ? "−" : "+"}</span>
      </button>

      {aberto ? (
        <div className="space-y-2 border-t p-3">
          {/*
            OS CONTROLES SÓ APARECEM COM COORDENADA (2026-08-26).

            Sem ela o painel casa por CIDADE, e um cursor de raio ali seria um controle que não faz
            nada — pior que a ausência dele, porque promete precisão que a tela não tem. O de
            "só livres" fica, porque funciona nos dois modos.
          */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {daOrigem ? (
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">{t("raio")}</span>
                <input
                  type="range"
                  min={25}
                  max={500}
                  step={25}
                  value={raioKm}
                  onChange={(e) => setRaioKm(Number(e.target.value))}
                  className="h-1 w-32 accent-primary"
                />
                <span className="w-16 tabular-nums">{t("aKm", { n: raioKm })}</span>
              </label>
            ) : null}
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={soLivres}
                onChange={(e) => setSoLivres(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              <span>{t("soLivres")}</span>
            </label>
          </div>

          {perto.length > 0 ? (
            <ul className="space-y-1">
              {perto.map((v) => (
                <li
                  key={v.placa}
                  className={cn(
                    "flex items-center gap-2 rounded px-1 text-xs",
                    focado === v.placa && "bg-accent",
                  )}
                >
                  {/**
                   * A PLACA E O NOME LEVAM AO MAPA (2026-08-28, a pedido).
                   *
                   * "quando clicar no nome do cara é direcionar onde ele está no mapa". Os dois entram
                   * no mesmo botão porque respondem à mesma pergunta — "cadê este aqui?" — e dois alvos
                   * de clique lado a lado, num texto de 12px, viram um jogo de mira.
                   *
                   * BOTÃO DE VERDADE, e não um `div` com `onClick`: assim ele entra na navegação por
                   * teclado e o leitor de tela anuncia que ali se clica.
                   */}
                  <button
                    type="button"
                    onClick={() => setFocado(v.placa)}
                    title={t("verNoMapa")}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left hover:underline"
                  >
                    <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="font-mono font-medium">{v.placa}</span>
                    <span className="truncate text-muted-foreground">
                      {v.motorista ?? v.cpfMotorista ?? t("semMotoristaVinculado")}
                    </span>
                  </button>
                  {/*
                    EM VIAGEM É AVISO, e por isso tem cor.

                    Ele só aparece quando o filtro "só livres" está desligado — com ele ligado, todo
                    mundo na lista está livre e um selo "livre" em toda linha seria ruído. Aqui a
                    ausência do selo já diz que está livre.

                    O número da LH vai junto porque é a pergunta seguinte: "em viagem" leva a "qual?",
                    e sem ele a pessoa teria de procurar.
                  */}
                  {v.emViagem ? (
                    <span
                      className="shrink-0 rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-100"
                      title={t("emViagemNa", { lh: v.emViagem })}
                    >
                      {t("emViagem")}
                    </span>
                  ) : null}
                  {/* A IDADE DA POSIÇÃO é o que decide se ela vale: um caminhão "em Guarulhos"
                      há seis horas pode estar em Curitiba agora. */}
                  {v.km == null ? null : (
                    <span className="shrink-0 font-medium tabular-nums">
                      {t("aKm", { n: Math.round(v.km) })}
                    </span>
                  )}
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

          {/*
            SEM POSIÇÃO, O MAPA NÃO SOME — ele explica (2026-08-26, a pedido).

            A primeira versão escondia o mapa quando não havia ponto. Em produção isso acontece
            SEMPRE, porque a credencial da gerenciadora não está configurada lá e o job sobe
            desligado — e o usuário abriu o painel, viu só texto, e perguntou "cadê o mapa?".

            Sumir sem explicação é a pior resposta: quem olha não sabe se é defeito, se é
            permissão, ou se a frota inteira está parada. Uma frase que diz o que falta transforma
            "está quebrado" em "falta ligar", que é acionável.
          */}
          {todos.length > 0 ? (
            <>
              <MapaDePosicoes
                pontos={todos}
                altura="18rem"
                aoClicar={aoEscolherPlaca}
                focoNoId={focado}
              />
              {/**
               * A LEGENDA, porque cor sem legenda é enfeite (2026-08-28).
             *
             * Foi a queixa exata: "o que significam esses pontos azuis e vermelhos". As cores novas
             * dizem algo de verdade, mas nada na tela ensinava a lê-las — e uma escala que a pessoa
             * precisa adivinhar é tão inútil quanto a antiga.
             */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                <Legenda cor="#22c55e" borda="#15803d" texto={t("estadoRodandoCurto")} />
                <Legenda cor="#f59e0b" borda="#b45309" texto={t("estado_ligado_parado")} />
                <Legenda cor="#94a3b8" borda="#475569" texto={t("estado_desligado")} />
                <Legenda cor="#e2e8f0" borda="#94a3b8" texto={t("estado_sem_sinal")} />
              </div>
            </>
          ) : frota.isPending ? null : (
            <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              {t("semPosicaoNenhuma")}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Uma bolinha e um rótulo — a mesma cor que o mapa desenha, para a leitura não depender de memória. */
function Legenda({ cor, borda, texto }: { cor: string; borda: string; texto: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: cor, border: `1px solid ${borda}` }}
      />
      {texto}
    </span>
  );
}

/**
 * O ESTADO DO VEÍCULO, que é o que a cor do ponto passa a dizer.
 *
 * A regra é ignição JUNTO de velocidade, e não uma das duas: medido em produção, o campo
 * `Velocidade` só vem quando o caminhão está andando — 37 de 108 posições, nenhuma com zero.
 * Então velocidade ausente não é "parado", é "sem valor", e quem decide é a ignição.
 *
 *   L + velocidade   rodando
 *   L sem velocidade ligado e parado (marcha lenta, carga, fila)
 *   D                desligado
 *   qualquer outra   sem sinal — inclusive o `?` que a gerenciadora manda em 2 de 108
 *
 * POSIÇÃO VELHA TAMBÉM É "sem sinal", por mais que a ignição diga algo: uma ignição ligada de seis
 * horas atrás não descreve o caminhão de agora, e pintá-la de verde seria afirmar movimento que
 * ninguém observou.
 */
const MINUTOS_ATE_ENVELHECER = 60;

function estadoDoVeiculo(v: {
  ignicao: string | null;
  velocidade: number | null;
  minutos: number | null;
}): "rodando" | "ligado_parado" | "desligado" | "sem_sinal" {
  if (v.minutos != null && v.minutos > MINUTOS_ATE_ENVELHECER) return "sem_sinal";
  const ign = (v.ignicao ?? "").trim().toUpperCase();
  if (ign === "L") return v.velocidade != null && v.velocidade > 0 ? "rodando" : "ligado_parado";
  if (ign === "D") return "desligado";
  return "sem_sinal";
}

/** A frase do estado, com a velocidade quando ela existe. */
function textoDoEstado(
  v: { ignicao: string | null; velocidade: number | null; minutos: number | null },
  t: (k: string, vars?: Record<string, string | number>) => string,
): string {
  const estado = estadoDoVeiculo(v);
  if (estado === "rodando") return t("estadoRodando", { kmh: v.velocidade ?? 0 });
  return t(`estado_${estado}`);
}
