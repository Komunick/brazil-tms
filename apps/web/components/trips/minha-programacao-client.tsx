"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Eye, EyeOff, Palette, SlidersHorizontal } from "lucide-react";
import { useMarcarViagem, useProgramacao } from "@/lib/trips/client";
import type { LinhaDaProgramacao } from "@brazil-tms/db";
import { proximasFrentes } from "@/lib/trips/frentes";
import { deslocamentoDoDia, diaDoDeslocamento } from "@/lib/trips/dias-da-programacao";
import { usePainelDoUsuario } from "@/lib/ui/painel-do-usuario";
import { ProgramacaoDetalhe } from "@/components/trips/programacao-detalhe";
import { StatusDaLinha } from "@/components/trips/status-da-linha";
import { SmDaLinha } from "@/components/trips/sm-da-linha";
import { ArrowLeftRight } from "lucide-react";
import { ComentariosDaLinha } from "@/components/trips/comentarios-da-linha";
import { TripStatusBadge } from "@/components/trips/trip-status-badge";
import { Copiar } from "@/components/trips/copiar";
import { PrevistoDaViagem } from "@/components/trips/previsto-da-viagem";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  REGION_ORDER,
  displayStatusOf,
  type TripDisplayStatus,
  type TripStatus,
  type ProgramacaoPrefs,
} from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
 * A PROGRAMAÇÃO — o quadro que substitui a planilha do Google (2026-08-24, a pedido).
 *
 * ── O QUE ESTA TELA APOSENTA ──────────────────────────────────────────────────────────────────
 *
 * "PROGRAMAÇÃO 2026 | BRAZIL TRANSPORTS": 12.317 linhas, uma por LH, mantida à mão. Região, data,
 * estação de origem e destino, as duas horas da coleta, perfil do veículo, motorista, CPF, telefone,
 * cavalo e carreta — tudo isso o TMS já sabia, e ninguém via junto. A planilha existia por causa do
 * ARRANJO, não do dado: por dia, com ontem à vista, e com linhas pintadas à mão.
 *
 * ── ONTEM ENTRA, E É O QUE MAIS IMPORTA ───────────────────────────────────────────────────────
 *
 * Um quadro que começa em "hoje" perde a viagem que saiu ontem à noite e ainda está na estrada —
 * exatamente a que alguém precisa acompanhar de manhã. Por isso a janela abre em ontem, e cada
 * grupo diz em letras qual dia é: ONTEM, HOJE, AMANHÃ, e depois a data.
 *
 * ── A COR É PESSOAL, E O ESCONDER TAMBÉM ──────────────────────────────────────────────────────
 *
 * Na planilha, pintar uma linha avisava a todo mundo — e ninguém combinou o que cada cor significa.
 * Aqui a marca é de quem marca: some da tela do colega. Foi decisão explícita, e evita o que a
 * planilha tem hoje, que é um arco-íris cujo significado morreu com quem pintou.
 *
 * Esconder não apaga: a viagem continua no quadro de todos, e some só desta tela. É o "eu escolho
 * quais LH ver" do pedido — o quadro mostra tudo e a pessoa tira o que não é dela.
 */

/**
 * A PALETA É CURTA DE PROPÓSITO.
 *
 * A planilha usa a paleta inteira do Google, e o resultado é uma tela onde a cor deixou de
 * significar qualquer coisa. Seis tons, cada um distinguível do outro em relance e no escuro, é o
 * que uma pessoa consegue usar com consistência. Quem precisar de um sétimo significado precisa de
 * uma coluna, não de outra cor.
 */
const CORES = [
  {
    chave: "vermelho",
    classe: "bg-red-500 hover:bg-red-600 text-white [&_a]:text-white [&_button]:text-white",
    ponto: "bg-red-500",
  },
  {
    chave: "ambar",
    classe:
      "bg-amber-400 hover:bg-amber-500 text-amber-950 [&_a]:text-amber-950 [&_button]:text-amber-950",
    ponto: "bg-amber-400",
  },
  {
    chave: "verde",
    classe: "bg-emerald-600 hover:bg-emerald-700 text-white [&_a]:text-white [&_button]:text-white",
    ponto: "bg-emerald-600",
  },
  {
    chave: "azul",
    classe: "bg-sky-600 hover:bg-sky-700 text-white [&_a]:text-white [&_button]:text-white",
    ponto: "bg-sky-600",
  },
  {
    chave: "roxo",
    classe: "bg-violet-600 hover:bg-violet-700 text-white [&_a]:text-white [&_button]:text-white",
    ponto: "bg-violet-600",
  },
  {
    chave: "cinza",
    classe: "bg-slate-600 hover:bg-slate-700 text-white [&_a]:text-white [&_button]:text-white",
    ponto: "bg-slate-600",
  },
] as const;

/**
 * COR CHEIA, E O TEXTO VAI JUNTO (2026-08-24, a pedido: "deixe mais forte também").
 *
 * Foram três tentativas até acertar, e as duas primeiras erraram pelo mesmo motivo. A 15% a marca
 * sumia num relance; a 40% dava para ver, mas ainda competia com o fundo da tabela. O pedido é que
 * a linha SALTE — e para saltar de verdade a cor tem de ser sólida.
 *
 * O que impedia a cor sólida era o texto: ele é `foreground`, escolhido para o fundo do tema, e
 * sobre vermelho cheio fica ilegível. Por isso cada cor traz o SEU par de texto, e os seletores
 * `[&_a]` e `[&_button]` alcançam o número da LH e o telefone, que têm cor própria de link e
 * ficariam azuis sobre azul.
 *
 * O âmbar é o único com texto escuro: amarelo claro com letra branca não se lê em tela nenhuma. É
 * a exceção que prova que a regra aqui é contraste, não uniformidade.
 */

const classeDaCor = (cor: string | null): string =>
  CORES.find((c) => c.chave === cor)?.classe ?? "";

/**
 * O STATUS COMO A LINHA MOSTRA, não como o banco guarda (2026-08-25, a pedido).
 *
 * O filtro nascia do `status` cru, e por isso não tinha "Em análise": `received` se desdobra na tela
 * em três — **Em análise** (o cliente ainda não aceitou), **P/Atribuir** (aceitou, falta escalar) e
 * **Na origem** (o portal já diz atribuída). Os três caíam num chip só, e não havia como esconder um
 * sem esconder os outros dois.
 *
 * O selo da linha já usava o desdobramento; o filtro, não. Um filtro que pinta o status de um jeito
 * e a tabela de outro obriga quem olha a traduzir entre os dois — que é exatamente o que o subcard
 * veio evitar.
 */
const statusDaLinha = (l: {
  status: string;
  acceptanceStatus: string | null;
  portalStatus: string | null;
}): TripDisplayStatus =>
  displayStatusOf(l.status as TripStatus, l.acceptanceStatus, l.portalStatus);

/**
 * "07600530570" → "076.005.305-70".
 *
 * Guardado sem pontuação, lido com. O botão ao lado copia os DÍGITOS, não a versão pontuada: quem
 * cola num campo de CPF de outro sistema quer o número, e a pontuação é o que costuma ser recusado.
 */
function cpfLegivel(cpf: string): string {
  return cpf.length === 11
    ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
    : cpf;
}

/**
 * A VIAGEM JÁ SAIU DA ESTAÇÃO — e a doca deixa de ser instrução (31/08, a pedido).
 *
 * Enquanto o veículo está na origem, a doca diz ONDE ir. Depois que ele parte, ela vira história, e
 * história ocupando espaço numa linha de quinze colunas é ruído sobre quem ainda está carregando.
 *
 * `in_transit` em diante. `at_destination` e o resto entram porque quem chegou também já saiu — o
 * que interessa lá é a descarga, não a doca de origem.
 *
 * O dado continua GRAVADO: some da tela, não do banco. O faturamento o encontra.
 */
const DEPOIS_DA_ESTACAO = new Set([
  "in_transit",
  "at_destination",
  "unloading",
  "unloaded",
  "completed",
  "billing_pending",
  "billing_ready",
  "billed",
  "cancelled",
]);

/** ONTEM/HOJE/AMANHÃ por extenso; do terceiro dia em diante a data já diz mais que a palavra. */
function rotuloDoDia(dia: string, hoje: string, t: (k: string) => string): string {
  const d = new Date(`${dia}T12:00:00`);
  const h = new Date(`${hoje}T12:00:00`);
  const diff = Math.round((d.getTime() - h.getTime()) / 86_400_000);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  if (diff === -1) return `${t("ontem")} · ${data}`;
  if (diff === 0) return `${t("hoje")} · ${data}`;
  if (diff === 1) return `${t("amanha")} · ${data}`;
  return `${d.toLocaleDateString("pt-BR", { weekday: "short" })} · ${data}`;
}

export function MinhaProgramacaoClient({
  userId,
  podeAtribuir,
}: {
  userId: string;
  podeAtribuir: boolean;
}) {
  const t = useTranslations("Programacao");
  /**
   * ATÉ DUAS FRENTES (2026-08-26, a pedido).
   *
   * Lista vazia = todas. São três frentes cadastradas, então duas é "tudo menos uma" — que é o
   * recorte que a operação pediu: quem cuida do Sudeste e do Sul-Centro-Oeste não quer o
   * Norte-Nordeste no meio.
   */
  /**
   * OS FILTROS SÃO LEMBRADOS (30/08, a pedido) — e no BANCO, por pessoa.
   *
   * Antes eles viviam só em `useState`: sair da tela e voltar zerava tudo, e quem cuida de uma
   * frente refazia a mesma escolha dezenas de vezes por dia.
   *
   * ── POR QUE NÃO EM COOKIE NEM EM localStorage ─────────────────────────────────────────────
   *
   * A mesma razão que fez `user_dashboard_prefs` existir: A OPERAÇÃO COMPARTILHA MÁQUINA. Dois
   * operadores no mesmo computador veriam o filtro um do outro, e o segundo desfaria a escolha do
   * primeiro sem perceber. A preferência é da pessoa, então segue a pessoa.
   *
   * ── O ESTADO LOCAL CONTINUA EXISTINDO, e não é redundância ────────────────────────────────
   *
   * Clicar num filtro pinta a tela na hora; a gravação vai atrás. Esperar o servidor para ver o
   * efeito de um clique faria a pessoa clicar duas vezes — o mesmo motivo pelo qual o painel já
   * grava de forma otimista.
   */
  /**
   * O "hoje" da EMPRESA, não o do computador de quem olha: o servidor agrupa por São Paulo, e a
   * tela precisa concordar com ele para não chamar de "amanhã" o que o grupo chama de hoje.
   *
   * Fica ACIMA das preferências de propósito: o filtro de dias guarda deslocamento, e tanto o efeito
   * que aplica o guardado quanto o `lembrar` precisam de `hoje` já existindo. Declarado depois, o
   * array de dependências do efeito o alcançaria antes da hora e a tela quebraria no carregamento.
   */
  const hoje = useMemo(
    () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
    [],
  );

  const prefs = usePainelDoUsuario();
  const [frentes, setFrentes] = useState<string[]>([]);
  const [mostrarOcultas, setMostrarOcultas] = useState(false);
  const [busca, setBusca] = useState("");
  const [paletaAberta, setPaletaAberta] = useState<string | null>(null);
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const [viagemAberta, setViagemAberta] = useState<string | null>(null);
  /** A viagem cujo previsto está sendo definido pelo botão da própria linha. */
  const [prevendo, setPrevendo] = useState<string | null>(null);
  const [painelDeDias, setPainelDeDias] = useState(false);
  const [diasEscondidos, setDiasEscondidos] = useState<Set<string>>(new Set());
  const [statusEscondidos, setStatusEscondidos] = useState<Set<string>>(new Set());

  /**
   * O guardado entra UMA VEZ, quando chega — depois quem manda é o clique.
   *
   * `carregado` é o sinal: antes dele o hook devolve o padrão, e aplicá-lo cedo faria a tela mostrar
   * o padrão por um instante e pular para o guardado. `aplicado` impede que uma revalidação da
   * consulta de preferências desfaça um filtro que a pessoa acabou de mexer.
   */
  const [aplicado, setAplicado] = useState(false);
  useEffect(() => {
    if (aplicado || !prefs.carregado) return;
    setFrentes(prefs.programacao.frentes);
    setStatusEscondidos(new Set(prefs.programacao.status));
    /*
      Os dias voltam do DESLOCAMENTO guardado — ver `programacaoPrefsSchema`. `-1` guardado ontem
      continua querendo dizer "ontem" hoje, que é o que faz o filtro sobreviver à virada do dia.
    */
    setDiasEscondidos(new Set(prefs.programacao.dias.map((d) => diaDoDeslocamento(d, hoje))));
    setMostrarOcultas(prefs.programacao.mostrarOcultas);
    setAplicado(true);
  }, [aplicado, prefs.carregado, prefs.programacao, hoje]);

  /** Grava o estado final, como o resto das preferências: sem `add`/`remove`, a última vence. */
  const lembrar = (mudanca: Partial<ProgramacaoPrefs>) => {
    if (!aplicado) return; // Antes de aplicar o guardado, gravar escreveria o padrão por cima dele.
    prefs.salvarProgramacao({
      frentes,
      status: [...statusEscondidos],
      dias: [...diasEscondidos].map((d) => deslocamentoDoDia(d, hoje)),
      mostrarOcultas,
      ...mudanca,
    });
  };

  /**
   * Esconder/mostrar um dia — pinta agora e grava atrás, como o resto dos filtros.
   *
   * Existe como função porque são DOIS botões (o dia e o "ver todos") e porque o `lembrar` precisa
   * do conjunto NOVO: passá-lo por `mudanca` evita depender do `useState` já ter reagido, que é o
   * mesmo cuidado do filtro de status logo abaixo.
   */
  const alternarDia = (dia: string) => {
    const novo = new Set(diasEscondidos);
    if (novo.has(dia)) novo.delete(dia);
    else novo.add(dia);
    setDiasEscondidos(novo);
    lembrar({ dias: [...novo].map((d) => deslocamentoDoDia(d, hoje)) });
  };

  const consulta = useProgramacao(frentes, { atras: 2, adiante: 7 });

  const alternarFrente = (valor: string) => {
    const proximas = proximasFrentes(frentes, valor);
    setFrentes(proximas);
    lembrar({ frentes: proximas });
  };
  const marcar = useMarcarViagem();

  const linhas = consulta.data?.linhas ?? [];

  const visiveis = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return linhas.filter((l) => {
      if (l.oculta && !mostrarOcultas) return false;
      if (termo === "") return true;
      return [l.externalTripId, l.origem, l.destino, l.motorista, l.placa]
        .filter(Boolean)
        .some((c) => String(c).toUpperCase().includes(termo));
    });
  }, [linhas, busca, mostrarOcultas]);

  /** Agrupado por dia, na ordem em que o servidor devolveu — que já é a da hora de coleta. */
  const porDia = useMemo(() => {
    const mapa = new Map<string, typeof visiveis>();
    for (const l of visiveis) {
      if (diasEscondidos.has(l.dia)) continue;
      if (statusEscondidos.has(statusDaLinha(l))) continue;
      const atual = mapa.get(l.dia);
      if (atual) atual.push(l);
      else mapa.set(l.dia, [l]);
    }
    return [...mapa.entries()];
  }, [visiveis, diasEscondidos, statusEscondidos]);

  /**
   * Os dias que a consulta trouxe, com a contagem de cada um.
   *
   * Calculado sobre a lista ANTES do filtro de dias, e não depois: senão, esconder um dia
   * o apagaria da própria lista de escolha, e não haveria como trazê-lo de volta.
   */
  const diasDaConsulta = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const l of visiveis) mapa.set(l.dia, (mapa.get(l.dia) ?? 0) + 1);
    return [...mapa.entries()];
  }, [visiveis]);

  /**
   * Os status presentes na consulta, do mais numeroso para o menos.
   *
   * Mesma razão da lista de dias: calculada ANTES do filtro de status, senão esconder um status o
   * apagaria da lista de escolha e não haveria como trazê-lo de volta. Ordenada por volume porque
   * o status com trinta viagens é o que a pessoa vem filtrar; o de duas ela nem procura.
   */
  const statusDaConsulta = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const l of visiveis) {
      if (diasEscondidos.has(l.dia)) continue;
      const s = statusDaLinha(l);
      mapa.set(s, (mapa.get(s) ?? 0) + 1);
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [visiveis, diasEscondidos]);

  const ocultas = linhas.filter((l) => l.oculta).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          {/* A frente da estação de ORIGEM, como no resto do painel — a mesma régua em toda tela. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">{t("porFrente")}</span>
            {[
              { valor: "", rotulo: t("todasAsFrentes") },
              ...REGION_ORDER.map((r) => ({ valor: r, rotulo: r })),
            ].map((f) => {
              const marcada = f.valor === "" ? frentes.length === 0 : frentes.includes(f.valor);
              return (
                <button
                  key={f.valor || "todas"}
                  type="button"
                  aria-pressed={marcada}
                  onClick={() => alternarFrente(f.valor)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    marcada
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.rotulo}
                </button>
              );
            })}
          </div>

          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("buscarPlaceholder")}
            className="h-8 max-w-xs"
          />

          {/* Só aparece quando existe algo escondido: um botão que nunca faz nada é ruído. */}
          {ocultas > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setMostrarOcultas(!mostrarOcultas);
                lembrar({ mostrarOcultas: !mostrarOcultas });
              }}
            >
              {mostrarOcultas ? (
                <EyeOff className="mr-1 h-3.5 w-3.5" aria-hidden />
              ) : (
                <Eye className="mr-1 h-3.5 w-3.5" aria-hidden />
              )}
              {mostrarOcultas ? t("esconderOcultas") : t("verOcultas", { n: ocultas })}
            </Button>
          ) : null}

          {/*
            O FILTRO DE DIAS ABRE NUM SUBCARD (2026-08-24, a pedido).
            A janela tem dez dias, e quase ninguém trabalha os dez ao mesmo tempo — mas dez botões
            fixos na barra empurrariam a frente e a busca para a segunda linha, todo dia, por causa
            de uma escolha que se faz uma vez. Fechado, ocupa um botão; aberto, mostra os dias que
            EXISTEM na consulta, com a contagem de cada um.
          */}
          <Button
            type="button"
            size="sm"
            variant={diasEscondidos.size + statusEscondidos.size > 0 ? "default" : "ghost"}
            onClick={() => setPainelDeDias((v) => !v)}
          >
            <SlidersHorizontal className="mr-1 h-3.5 w-3.5" aria-hidden />
            {diasEscondidos.size + statusEscondidos.size > 0
              ? t("filtrosAtivos", { n: diasEscondidos.size + statusEscondidos.size })
              : t("dias")}
          </Button>

          <span className="ml-auto text-xs text-muted-foreground">
            {t("totalLinhas", { n: visiveis.length })}
          </span>

          {painelDeDias ? (
            <div className="w-full space-y-2 rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">{t("quaisDias")}</p>
              <div className="flex flex-wrap gap-1.5">
                {diasDaConsulta.map(([dia, quantos]) => {
                  const escondido = diasEscondidos.has(dia);
                  return (
                    <button
                      key={dia}
                      type="button"
                      aria-pressed={!escondido}
                      onClick={() => alternarDia(dia)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        escondido
                          ? "text-muted-foreground line-through opacity-60"
                          : "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {rotuloDoDia(dia, hoje, t)} · {quantos}
                    </button>
                  );
                })}
              </div>
              {/* Um caminho de volta explícito: desmarcar oito dias um a um para voltar ao normal
                  seria pagar pelo filtro duas vezes. */}
              {diasEscondidos.size > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDiasEscondidos(new Set());
                    lembrar({ dias: [] });
                  }}
                >
                  {t("verTodosOsDias")}
                </Button>
              ) : null}

              {/*
                O STATUS MORA NO MESMO PAINEL QUE OS DIAS (2026-08-24, a pedido).
                São a mesma pergunta feita de dois jeitos — "o que eu quero ver agora" —, e um botão
                próprio para cada uma faria a barra crescer de novo, que é justamente o que o subcard
                veio evitar. O selo é o MESMO `TripStatusBadge` do resto do sistema: um filtro que
                pinta o status de um jeito e a tabela de outro obriga a traduzir entre as duas.
              */}
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">{t("quaisStatus")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {statusDaConsulta.map(([status, quantos]) => {
                    const escondido = statusEscondidos.has(status);
                    return (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={!escondido}
                        onClick={() => {
                          const novo = new Set(statusEscondidos);
                          if (novo.has(status)) novo.delete(status);
                          else novo.add(status);
                          setStatusEscondidos(novo);
                          lembrar({ status: [...novo] });
                        }}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-opacity",
                          escondido ? "opacity-40" : "",
                        )}
                      >
                        <TripStatusBadge status={status as TripDisplayStatus} />
                        <span className="tabular-nums text-muted-foreground">{quantos}</span>
                      </button>
                    );
                  })}
                </div>
                {statusEscondidos.size > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setStatusEscondidos(new Set());
                      lembrar({ status: [] });
                    }}
                  >
                    {t("verTodosOsStatus")}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {consulta.isPending ? <Skeleton className="h-96 w-full" /> : null}

      {!consulta.isPending && porDia.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("vazio")}</p>
          </CardContent>
        </Card>
      ) : null}

      {porDia.map(([dia, doDia]) => (
        <Card key={dia}>
          <CardContent className="overflow-x-auto pt-6">
            {/*
              O DIA INTEIRO RECOLHE (2026-08-24, a pedido).
              Com anteontem, ontem, hoje e mais sete dias, a página passa de quinhentas linhas — e
              quem está tocando a operação de hoje não quer rolar por cima de sexta-feira. O botão é
              o cabeçalho todo, não uma setinha: alvo grande para uma ação que se repete o dia
              inteiro. A contagem CONTINUA visível recolhida, senão fechar o dia esconderia também a
              informação de que ele existe e tem trabalho dentro.
            */}
            <button
              type="button"
              aria-expanded={!recolhidos.has(dia)}
              onClick={() =>
                setRecolhidos((atuais) => {
                  const novo = new Set(atuais);
                  if (novo.has(dia)) novo.delete(dia);
                  else novo.add(dia);
                  return novo;
                })
              }
              className="mb-2 flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-muted/50"
            >
              {recolhidos.has(dia) ? (
                <ChevronRight className="h-4 w-4 self-center text-muted-foreground" aria-hidden />
              ) : (
                <ChevronDown className="h-4 w-4 self-center text-muted-foreground" aria-hidden />
              )}
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                {rotuloDoDia(dia, hoje, t)}
              </h2>
              <span className="text-xs text-muted-foreground">
                {t("lhsNoDia", { n: doDia.length })}
              </span>
            </button>

            <Table className={cn(recolhidos.has(dia) && "hidden")}>
              <TableHeader>
                <TableRow>
                  {/* A coluna das MARCAÇÕES: a cor (pessoal) e o status (de todos). */}
                  <TableHead className="w-8" />
                  <TableHead className="w-24">{t("statusOperacional")}</TableHead>
                  <TableHead>{t("lh")}</TableHead>
                  <TableHead>{t("rota")}</TableHead>
                  <TableHead>{t("etaOrigem")}</TableHead>
                  <TableHead>{t("cptOrigem")}</TableHead>
                  <TableHead>{t("etaDestino")}</TableHead>
                  <TableHead>{t("perfil")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("motorista")}</TableHead>
                  <TableHead>{t("placa")}</TableHead>
                  <TableHead>{t("contato")}</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {doDia.map((l) => (
                  <TableRow
                    key={l.tripId}
                    /*
                      `group` é o que faz os botões de copiar aparecerem no hover DA LINHA — eles
                      nascem `opacity-0` e sobem com `group-hover`. Sem esta classe aqui, os cinco
                      botões ficariam invisíveis para sempre, e o recurso seria código morto.
                    */
                    className={cn("group", classeDaCor(l.cor), l.oculta && "opacity-40")}
                  >
                    {/* A paleta abre na própria linha: pintar é gesto de tela, não vale uma janela. */}
                    <TableCell className="p-1">
                      <div className="relative">
                        <button
                          type="button"
                          aria-label={t("marcarCor")}
                          onClick={() => setPaletaAberta((a) => (a === l.tripId ? null : l.tripId))}
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                          <Palette className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        {paletaAberta === l.tripId ? (
                          <div className="absolute z-20 mt-1 flex gap-1 rounded-md border bg-background p-1.5 shadow-md">
                            {CORES.map((c) => (
                              <button
                                key={c.chave}
                                type="button"
                                aria-label={c.chave}
                                className={cn("h-4 w-4 rounded-full", c.ponto)}
                                onClick={() => {
                                  marcar.mutate({ tripId: l.tripId, cor: c.chave });
                                  setPaletaAberta(null);
                                }}
                              />
                            ))}
                            <button
                              type="button"
                              aria-label={t("semCor")}
                              className="h-4 w-4 rounded-full border"
                              onClick={() => {
                                marcar.mutate({ tripId: l.tripId, cor: null });
                                setPaletaAberta(null);
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </TableCell>

                    {/*
                      O STATUS FICA AO LADO DA COR (2026-08-26, a pedido), e é a mesma ideia vista
                      de dois ângulos: uma marcação pessoal e uma de todos, no mesmo canto da linha.
                      A caixinha abre para baixo e some ao escolher — a linha não cresce.
                    */}
                    <TableCell className="p-1">
                      {/*
                        O SM FICA AO LADO DO STATUS (31/08, a pedido), e não dentro dele: o status é
                        uma escada (a enviar → enviado → prog OK) e a SM convive com qualquer degrau.
                        Como quinto valor, a tela teria de escolher entre dizer uma coisa ou a outra.
                      */}
                      <div className="flex items-center gap-1">
                        <StatusDaLinha
                          tripId={l.tripId}
                          status={l.statusOperacional}
                          podeMarcar={podeAtribuir}
                        />
                        <SmDaLinha tripId={l.tripId} sm={l.sm} podeMarcar={podeAtribuir} />
                      </div>
                    </TableCell>

                    <TableCell className="font-mono text-xs">
                      {/*
                        Clicar na LH abre uma JANELA, não outra página (2026-08-24, a pedido).
                        Numa programação de centenas de linhas, sair da tela é perder o lugar na
                        lista — e o lugar é o fio de quem está trabalhando. A janela traz o que se
                        decide daqui: onde a viagem está, o que já aconteceu e quem vai dirigir; o
                        resto continua na tela própria, a um clique de dentro dela.
                      */}
                      <button
                        type="button"
                        onClick={() => setViagemAberta(l.tripId)}
                        className="underline underline-offset-2 hover:text-primary"
                      >
                        {l.externalTripId ?? "—"}
                      </button>
                      {/* A LH é o que se leva para o portal — é o campo mais copiado da tela. */}
                      {l.externalTripId ? (
                        <Copiar valor={l.externalTripId} rotulo={t("copiarLh")} className="ml-1" />
                      ) : null}
                      {/*
                        O RECADO ABRE NO PRÓPRIO MARCADOR (2026-08-26, a pedido).

                        Antes ele abria a janela inteira da viagem, e a conversa ficava no rodapé
                        dela, depois da linha do tempo — ler um recado custava abrir, rolar, ler e
                        fechar. O usuário apontou, e agora o marcador abre só a conversa.

                        Ele aparece MESMO COM ZERO, apagado: sem isso não haveria por onde escrever
                        o PRIMEIRO comentário sem abrir a LH, que é justamente o caminho que isto
                        veio encurtar.
                      */}
                      <ComentariosDaLinha
                        tripId={l.tripId}
                        externalTripId={l.externalTripId}
                        quantos={l.comentarios}
                        userId={userId}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {l.origem ?? "—"}
                      <span className="px-1 text-muted-foreground">→</span>
                      {l.destino ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">
                      {l.etaOrigem ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">
                      {l.cptOrigem ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">
                      {l.etaDestino ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs uppercase">{l.perfil ?? "—"}</TableCell>
                    <TableCell>
                      {/*
                        A DOCA VEM ANTES DO STATUS (30/08, a pedido).

                        Saber que a viagem está "Carregando" sem saber ONDE manda quem acompanha
                        perguntar por rádio — e a doca já existia no TMS, guardada no detalhe da
                        viagem, a dois cliques de distância de quem precisa dela.

                        Na MESMA célula, e não numa coluna nova: a linha já tem quinze colunas, e a
                        doca só quer dizer alguma coisa junto do carregamento. Coluna própria seria
                        uma faixa vazia em todas as linhas que não estão carregando.

                        Só aparece quando está preenchida: um "Doca —" em cada linha do quadro seria
                        ruído em cima de um dado que quase sempre não existe ainda.
                      */}
                      {/*
                        EM CIMA DO STATUS, SEMPRE — `flex-col` e não `flex-wrap` (31/08, a pedido).

                        Com `flex-wrap` a doca ficava ao lado quando havia largura, e embaixo quando
                        não havia: a mesma tela mudava de forma conforme o monitor, e quem trabalha
                        em dois computadores via dois layouts. Coluna fixa é previsível.

                        `items-start` para o selo não esticar até a largura da célula.
                      */}
                      <div className="flex flex-col items-start gap-1">
                        {/*
                          E SOME DEPOIS QUE A VIAGEM SAI (31/08, a pedido).

                          A doca responde "onde está carregando". Assim que o veículo entra em
                          trânsito, ela deixa de ser instrução e vira história — e história ocupando
                          espaço numa linha de quinze colunas é ruído sobre quem ainda está na
                          estação.

                          Sumir da TELA, não do banco: `plates_internas` e `Doca (portal)` continuam
                          gravados, e o faturamento os encontra. Medido em 30/08: 49 de 53 viagens
                          já partidas mantiveram a doca guardada.
                        */}
                        {l.doca && !DEPOIS_DA_ESTACAO.has(l.status) ? (
                          <span className="rounded border px-1 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                            {t("doca", { n: l.doca })}
                          </span>
                        ) : null}
                        <TripStatusBadge
                          status={l.status as TripDisplayStatus}
                          portalAcceptance={l.acceptanceStatus}
                          portalStatus={l.portalStatus}
                        />
                      </div>
                    </TableCell>
                    {/*
                      O PREVISTO OCUPA A CÉLULA ENQUANTO ELA ESTIVER VAZIA (2026-08-26, a pedido).
                      Não é uma coluna nova: duas colunas de motorista lado a lado obrigariam quem
                      olha a decidir qual vale, toda linha, para sempre. Aqui a célula diz uma coisa
                      só — o que está escalado, ou, na falta dele, o que se pretende. O selo em
                      cinza e o itálico existem para que ninguém confunda intenção com ordem.
                    */}
                    <TableCell className="text-xs">
                      {l.motorista ? (
                        <span className="inline-flex items-center gap-1">
                          {l.motorista}
                          <SeloDeVinculo vinculo={l.vinculo} />
                          {/*
                            O MOTORISTA FOI TROCADO (31/08, a pedido).

                            Medido antes de construir: 48 viagens tiveram mais de uma atribuição
                            concluída, e em 32 o motorista de fato mudou. O ícone só aparece nessas —
                            trocar só a placa não é troca de motorista, e o balão fala do anterior.

                            O dado estava em `portal_commands` desde agosto, com o motorista, quem
                            pediu e quando, e nenhuma tela o mostrava.
                          */}
                          {l.trocouMotorista ? (
                            /*
                              O `title` vai no `span`, e não no ícone: o componente do lucide não
                              aceita a prop e o balão simplesmente não apareceria — sem erro, porque
                              props desconhecidas somem em silêncio no React.
                            */
                            <span
                              className="inline-flex"
                              aria-label={t("motoristaTrocado")}
                              title={[
                                l.motoristaAnterior
                                  ? t("motoristaAnterior", { nome: l.motoristaAnterior })
                                  : null,
                                l.trocadoPor ? t("quemAlterou", { nome: l.trocadoPor }) : null,
                                l.trocadoEm
                                  ? new Date(l.trocadoEm).toLocaleString("pt-BR", {
                                      timeZone: "America/Sao_Paulo",
                                      day: "2-digit",
                                      month: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : null,
                              ]
                                .filter(Boolean)
                                .join("\n")}
                            >
                              <ArrowLeftRight
                                className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400"
                                aria-hidden
                              />
                            </span>
                          ) : null}
                          <Copiar valor={l.motorista} rotulo={t("copiarMotorista")} />
                        </span>
                      ) : (
                        <Previsto
                          texto={l.previstoMotorista}
                          rotulo={t("previsto")}
                          rotuloDefinir={t("prever")}
                          aoDefinir={podeAtribuir ? () => setPrevendo(l.tripId) : undefined}
                        />
                      )}
                      {/*
                        O CPF EMBAIXO DO NOME (31/08, a pedido).

                        Ele já vinha na consulta e nenhuma coluna o mostrava. É o que a gerenciadora
                        e o portal pedem para achar a pessoa, e sem ele aqui a busca era pelo nome —
                        que é chave frágil e já custou três motoristas que existiam e o sistema
                        jurava não existirem.

                        Embaixo e em tom secundário: quem lê a coluna procura o NOME. O CPF é para
                        levar a outro lugar, e é por isso que ele nasce com o botão de copiar ao
                        lado em vez de convidar a digitação.
                      */}
                      {l.cpf ? (
                        <span className="text-muted-foreground flex items-center gap-1 font-mono text-[0.65rem]">
                          {cpfLegivel(l.cpf)}
                          <Copiar valor={l.cpf} rotulo={t("copiarCpf")} />
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {l.placa ? (
                        <span className="inline-flex items-center gap-1">
                          {l.placa}
                          <Copiar valor={l.placa} rotulo={t("copiarPlaca")} />
                        </span>
                      ) : (
                        // Sem `aoDefinir` nesta coluna: o previsto é UMA decisão (quem e com quê), e
                        // dois convites para a mesma janela na mesma linha só ocupam espaço.
                        <Previsto
                          texto={l.previstoPlaca}
                          rotulo={t("previsto")}
                          rotuloDefinir={t("prever")}
                        />
                      )}
                      {/*
                        A PLACA QUE NÃO FOI AO PORTAL, embaixo da que foi (30/08, a pedido).

                        O caso: uma CARRETA rodou no lugar de um TRUCK. O portal aceita uma placa só
                        nessa LH — vai a do cavalo — e a segunda existia no banco sem nenhuma tela
                        para mostrá-la. O faturamento precisa dela para pagar pela tarifa de carreta,
                        e sem ela aqui a planilha paralela continuava sendo a fonte da verdade.

                        Embaixo e em tom secundário, não ao lado: quem lê a coluna procura a placa
                        que a portaria vai conferir, e essa é a de cima. A segunda é contexto de
                        quem fatura, e não pode disputar o olho de quem opera.
                      */}
                      {l.placaInterna ? (
                        <span
                          className="text-muted-foreground block text-[0.65rem]"
                          title={t("placaInternaDetalhe")}
                        >
                          + {l.placaInterna}
                          {/* Copiável como a de cima: o faturamento leva as DUAS. */}
                          <Copiar valor={l.placaInterna} rotulo={t("copiarPlaca")} />
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {/* Discar no celular, copiar no computador — o `tel:` faz as duas. */}
                      {l.telefone ? (
                        <span className="inline-flex items-center gap-1">
                          <a className="underline underline-offset-2" href={`tel:${l.telefone}`}>
                            {l.telefone}
                          </a>
                          {/* Discar resolve no celular; copiar resolve no WhatsApp Web. */}
                          <Copiar valor={l.telefone} rotulo={t("copiarTelefone")} />
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="p-1 text-right">
                      <button
                        type="button"
                        aria-label={l.oculta ? t("mostrar") : t("esconder")}
                        title={l.oculta ? t("mostrar") : t("esconder")}
                        onClick={() => marcar.mutate({ tripId: l.tripId, oculta: !l.oculta })}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        {l.oculta ? (
                          <Eye className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <ProgramacaoDetalhe
        tripId={viagemAberta}
        aberto={viagemAberta !== null}
        aoFechar={() => setViagemAberta(null)}
        userId={userId}
        podeAtribuir={podeAtribuir}
      />

      {/*
        A JANELA DO PREVISTO, aberta pelo botão da linha — pequena de propósito.

        O detalhe da viagem tem linha do tempo, Pré-SM e comentários; abri-lo inteiro para escrever
        um nome é o caminho que já existia, e é o caminho que ninguém percorria. Aqui a janela faz
        uma pergunta só e fecha ao gravar.

        `key` no `tripId`: sem ela, abrir o previsto de outra viagem reaproveitaria o formulário
        montado com os valores da anterior — o `Editor` decide o estado inicial na MONTAGEM, e é
        essa escolha (documentada lá) que impede o laço de efeito que derrubou a atribuição em 22/08.
      */}
      <Dialog open={prevendo !== null} onOpenChange={(v) => !v && setPrevendo(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("previstoTitulo")}</DialogTitle>
          </DialogHeader>
          {prevendo ? (
            <PrevistoDaViagem
              key={prevendo}
              tripId={prevendo}
              podeMexer={podeAtribuir}
              comecarEditando
              aoConcluir={() => setPrevendo(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * O PREVISTO, quando existe — e um traço quando não.
 *
 * Componente e não expressão repetida porque são dois usos idênticos (motorista e placa) e o
 * terceiro é provável. O selo vem em `not-italic` de propósito: itálico dentro de itálico deixa
 * de ser distinção, e é a distinção inteira que este desenho está tentando fazer.
 */
function Previsto({
  texto,
  rotulo,
  aoDefinir,
  rotuloDefinir,
}: {
  texto: string | null;
  rotulo: string;
  /**
   * O CONVITE MORA NA CÉLULA VAZIA (31/08, a pedido).
   *
   * Antes, definir um previsto exigia clicar na linha, abrir a janela de detalhe e achar o bloco no
   * meio dela. Medido em produção no dia do pedido: das 310 linhas de `trip_programacao`, apenas
   * **27** tinham previsto — contra 303 com status, que tem botão na própria linha. A diferença não
   * é de utilidade, é de distância: o recurso que está na linha é usado, o que está a três cliques
   * não é.
   *
   * A célula do motorista já estava vazia mostrando um travessão. Um travessão não convida a nada, e
   * é justamente o lugar onde a pergunta "quem vai dirigir?" acontece.
   */
  aoDefinir?: () => void;
  rotuloDefinir: string;
}) {
  if (!texto) {
    if (!aoDefinir) return <span className="text-muted-foreground">—</span>;
    return (
      <button
        type="button"
        onClick={(e) => {
          // A linha inteira abre o detalhe da viagem — sem isto, o clique acionaria os dois.
          e.stopPropagation();
          aoDefinir();
        }}
        className="rounded border border-dashed px-1.5 py-0.5 text-[0.7rem] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        {rotuloDefinir}
      </button>
    );
  }
  return (
    <span className="italic text-muted-foreground">
      {texto}
      <span className="ml-1 rounded bg-muted px-1 py-px text-[10px] font-normal not-italic">
        {rotulo}
      </span>
    </span>
  );
}

/**
 * FROTA, AGREGADO OU TERCEIRO — o vínculo, ao lado do nome (2026-09-02, a pedido).
 *
 * ── POR QUE ELE CABE NA CÉLULA DO MOTORISTA, e não numa coluna ────────────────────────────────
 *
 * Vínculo é um adjetivo do motorista, não um dado da viagem. Uma coluna própria custaria largura em
 * todas as linhas para dizer uma palavra, e afastaria o rótulo justamente do nome a que ele se
 * refere. Ao lado do nome, ele se lê junto.
 *
 * ── TERCEIRO FICA APAGADO, E ISSO NÃO É DESCUIDO ──────────────────────────────────────────────
 *
 * Medido em 02/09, na produção: das 137 viagens do dia com motorista, **98 são terceiro**, 24
 * agregado e 18 frota. Se os três tivessem a mesma força visual, a coluna viraria uma parede de
 * selos coloridos e o olho não acharia mais nada — o que se procura ali é a EXCEÇÃO. Frota e
 * agregado ganham cor; terceiro, que é a regra, fica em cinza.
 *
 * ── SEM VÍNCULO NÃO DESENHA NADA ──────────────────────────────────────────────────────────────
 *
 * O portal manda o nome de quem dirige e não sabe de quem é o caminhão — o vínculo é do NOSSO
 * cadastro. Motorista que o portal escalou e que ainda não existe aqui não tem vínculo, e a célula
 * fica com o nome puro. Inventar um valor seria pior que a ausência: alguém faturaria pela tarifa
 * errada por causa de um selo que ninguém conferiu.
 */
const CORES_DO_VINCULO = {
  owned: "border-emerald-300 bg-emerald-50 text-emerald-800",
  agregado: "border-sky-300 bg-sky-50 text-sky-800",
  subcontracted: "border-transparent bg-muted text-muted-foreground",
} as const;

function SeloDeVinculo({ vinculo }: { vinculo: LinhaDaProgramacao["vinculo"] }) {
  const t = useTranslations("Programacao");
  if (!vinculo) return null;
  return (
    <span
      className={`shrink-0 rounded border px-1 py-px text-[0.6rem] font-bold uppercase leading-none tracking-wide ${CORES_DO_VINCULO[vinculo]}`}
    >
      {t(`vinculo_${vinculo}`)}
    </span>
  );
}
