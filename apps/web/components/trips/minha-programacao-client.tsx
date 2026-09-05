"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Palette,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import { useMarcarCte, useMarcarSm, useMarcarViagem, useProgramacao } from "@/lib/trips/client";
import { proximasFrentes } from "@/lib/trips/frentes";
import { deslocamentoDoDia, diaDoDeslocamento } from "@/lib/trips/dias-da-programacao";
import { usePainelDoUsuario } from "@/lib/ui/painel-do-usuario";
import { ProgramacaoDetalhe } from "@/components/trips/programacao-detalhe";
import { StatusDaLinha } from "@/components/trips/status-da-linha";
import { MarcaVouX } from "@/components/trips/marca-v-ou-x";
import { ArrowLeftRight } from "lucide-react";
import { ComentariosDaLinha } from "@/components/trips/comentarios-da-linha";
import { TripStatusBadge } from "@/components/trips/trip-status-badge";
import { Copiar } from "@/components/trips/copiar";
import { SeloDeVinculo } from "@/components/trips/selo-de-vinculo";
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

/**
 * AS COLUNAS QUE DÁ PARA ESCONDER (2026-09-04, a pedido).
 *
 * A linha tem quinze colunas e cabe numa tela larga; em notebook, não. Quem trabalha só com a
 * expedição não quer ver SM e CTE; quem confere documento não quer ver ETA. A saída até aqui era
 * rolar a tabela para o lado o dia inteiro.
 *
 * ── A LH NÃO ENTRA NA LISTA, e é a única de fora ──────────────────────────────────────────────
 *
 * Ela é a identidade da linha: sem o número, a linha deixa de ser uma viagem e vira um punhado de
 * campos que ninguém consegue casar com o portal. Esconder o resto é escolha de quem olha; esconder
 * a LH é perder o assunto.
 *
 * A ordem aqui é a da TABELA, de propósito: o painel lê como a linha se lê, e quem procura uma
 * coluna a encontra no lugar em que ela aparece.
 */
/**
 * QUANTOS DIAS PARA TRÁS O QUADRO ALCANÇA (2026-09-04, a pedido: "estenda por mais 3 dias").
 *
 * Eram dois, e dois não bastam: uma viagem longa sai hoje e chega depois de amanhã, e nesse meio
 * tempo ela é justamente a que alguém está acompanhando. Ao passar de dois dias ela sumia da tela
 * ainda em movimento.
 *
 * Medido no dia do pedido: **seis viagens ainda rodando** estavam fora — cinco com coleta há três
 * dias (três em trânsito, duas no destino) e uma há quatro, em trânsito. Não é muito, e é exatamente
 * a lista que alguém procura quando pergunta "cadê o motorista tal?".
 *
 * Cinco, e não mais: o passado cresce sem limite e o quadro é de trabalho, não de histórico. O que
 * já chegou tem a sua tela; aqui interessa o que ainda está na estrada.
 */
const DIAS_ATRAS = 5;

/**
 * QUANTOS DIAS PARA A FRENTE — sete, como sempre foi (decisão do usuário, 04/09).
 *
 * Chegou a ser escolhível (7/15/30) e voltou a ser fixo a pedido. Fica registrado o que a escolha
 * escondia, porque o número não some junto com o controle: no dia da decisão havia **260 viagens**
 * além do sétimo dia, e **as 260 esperando atribuição** — a fila inteira do que ainda não foi
 * escalado, com coleta em 12, 13 e 14/09.
 *
 * O que sobrevive daquela investigação é o RÓTULO: a tela diz de quando até quando ela vai. Foi a
 * borda invisível que fez alguém conferir dez LHs à mão e concluir que o TMS não estava recebendo.
 */
const DIAS_ADIANTE = 7;

const COLUNAS_OCULTAVEIS = [
  "statusOperacional",
  "sm",
  "cte",
  "rota",
  "etaOrigem",
  "cptOrigem",
  "etaDestino",
  "perfil",
  "status",
  "motorista",
  "placa",
  "contato",
] as const;

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
  podeEditarVinculo,
  podeMarcarSm,
  podeMarcarCte,
}: {
  userId: string;
  podeAtribuir: boolean;
  /** Editar o vínculo é `manage_fleet_data` — a mesma chave da aba de Motoristas. */
  podeEditarVinculo: boolean;
  /** `marcar_sm` — do setor GR, que emite a SM. */
  podeMarcarSm: boolean;
  /** `marcar_cte` — do setor Fiscal, que emite o CTE. */
  podeMarcarCte: boolean;
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
  const [busca, setBusca] = useState("");
  const [paletaAberta, setPaletaAberta] = useState<string | null>(null);
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const [viagemAberta, setViagemAberta] = useState<string | null>(null);
  /** A viagem cujo previsto está sendo definido pelo botão da própria linha. */
  const [prevendo, setPrevendo] = useState<string | null>(null);
  const [painelDeDias, setPainelDeDias] = useState(false);
  const [diasEscondidos, setDiasEscondidos] = useState<Set<string>>(new Set());
  const [statusEscondidos, setStatusEscondidos] = useState<Set<string>>(new Set());
  const [colunasEscondidas, setColunasEscondidas] = useState<Set<string>>(new Set());

  /**
   * O ÚLTIMO DIA QUE O QUADRO ALCANÇA, por extenso.
   *
   * Existe para ser MOSTRADO. Uma janela que corta em silêncio faz quem procura concluir que o dado
   * não existe — foi o que aconteceu em 04/09, com dez LHs conferidas à mão que estavam no banco o
   * tempo todo. A borda continua existindo; o que muda é que ela passa a ser visível.
   */
  const janela = useMemo(() => {
    const dia = (deslocamento: number): string => {
      const d = new Date(`${hoje}T12:00:00`);
      d.setDate(d.getDate() + deslocamento);
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    };
    // AS DUAS BORDAS, e não só a da frente: a de trás foi a que escondeu seis viagens ainda rodando.
    return { inicio: dia(-DIAS_ATRAS), fim: dia(DIAS_ADIANTE) };
  }, [hoje]);

  /**
   * A COLUNA APARECE? — a mesma pergunta para o cabeçalho e para a célula.
   *
   * UMA função, e não duas condições parecidas: se as duas divergissem, a tabela sairia com uma
   * coluna a mais de um lado e o alinhamento inteiro andaria — o tipo de defeito que se vê e não se
   * explica.
   */
  const mostrar = (coluna: string): boolean => !colunasEscondidas.has(coluna);

  const alternarColuna = (coluna: string): void => {
    const novo = new Set(colunasEscondidas);
    if (novo.has(coluna)) novo.delete(coluna);
    else novo.add(coluna);
    setColunasEscondidas(novo);
    lembrar({ colunas: [...novo] });
  };

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
    setColunasEscondidas(new Set(prefs.programacao.colunas ?? []));
    /*
      Os dias voltam do DESLOCAMENTO guardado — ver `programacaoPrefsSchema`. `-1` guardado ontem
      continua querendo dizer "ontem" hoje, que é o que faz o filtro sobreviver à virada do dia.
    */
    setDiasEscondidos(new Set(prefs.programacao.dias.map((d) => diaDoDeslocamento(d, hoje))));
    setAplicado(true);
  }, [aplicado, prefs.carregado, prefs.programacao, hoje]);

  /** Grava o estado final, como o resto das preferências: sem `add`/`remove`, a última vence. */
  const lembrar = (mudanca: Partial<ProgramacaoPrefs>) => {
    if (!aplicado) return; // Antes de aplicar o guardado, gravar escreveria o padrão por cima dele.
    prefs.salvarProgramacao({
      frentes,
      status: [...statusEscondidos],
      dias: [...diasEscondidos].map((d) => deslocamentoDoDia(d, hoje)),
      // Sem efeito desde 04/09 — repassada como está para não apagar o que já estava guardado.
      mostrarOcultas: prefs.programacao.mostrarOcultas,
      colunas: [...colunasEscondidas],
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

  /*
    A JANELA VAI ATÉ ONDE A PESSOA ESCOLHEU (2026-09-04, a pedido).

    Era fixa em sete dias. Em 04/09 a operação conferiu DEZ LHs à mão e concluiu que o TMS não estava
    recebendo — as dez estavam no banco, com coleta oito e nove dias à frente. A tela não ia até lá, e
    não dizia que não ia.
  */
  const consulta = useProgramacao(frentes, { atras: DIAS_ATRAS, adiante: DIAS_ADIANTE });

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
      /*
        NÃO SE ESCONDE MAIS LINHA (2026-09-04, a pedido: "não é mais necessário").

        O filtro que existia aqui é o que trazia de volta as 33 LHs que 9 pessoas tinham escondido:
        tirar só o botão e deixar o filtro faria essas 33 sumirem para sempre, sem nenhum caminho de
        volta. A coluna `oculta` continua no banco, marcada como estava — descartar arquiva, não
        apaga —, e simplesmente deixou de ter efeito.
      */
      if (termo === "") return true;
      return [l.externalTripId, l.origem, l.destino, l.motorista, l.segundoMotorista, l.placa]
        .filter(Boolean)
        .some((c) => String(c).toUpperCase().includes(termo));
    });
  }, [linhas, busca]);

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
   * AS PLACAS DO QUE ESTÁ NA TELA — para colar numa coluna de planilha (2026-09-02, a pedido).
   *
   * ── SAI DE `porDia`, E NÃO DE `visiveis` ──────────────────────────────────────────────────
   *
   * `visiveis` só aplicou a busca; `porDia` já passou também pelos dias e pelos status escondidos.
   * O pedido foi "as placas do filtro selecionado", e filtro é o que a pessoa ESTÁ VENDO. Copiar de
   * `visiveis` traria de volta linhas que ela acabou de esconder — o pior tipo de erro aqui, porque
   * a lista colada parece certa e ninguém confere placa por placa.
   *
   * ── UMA LINHA POR LH, COM AS PLACAS LADO A LADO (2026-09-04, a pedido) ────────────────────
   *
   * O portal manda as duas num campo só, separadas por vírgula ("PVZ6F36,FYD0H47"). Medido em
   * produção: das 196 viagens com placa num dia, **146 têm duas** — é a maioria, não a exceção.
   *
   * Elas iam uma por linha, e a lista saía maior que o número de LHs. O pedido mudou: agora cada LH
   * é UMA linha, com as suas placas separadas por TABULAÇÃO.
   *
   * A tabulação não é enfeite — é o que faz a colagem cair em COLUNAS VIZINHAS da planilha, cavalo
   * numa e carreta na outra. Com vírgula ou espaço as duas cairiam na mesma célula e alguém teria de
   * separar à mão, que é o trabalho que copiar veio eliminar.
   *
   * A INTERNA ENTRA JUNTO quando existe. Ela é a placa que rodou e que o portal não aceitou (a
   * carreta no lugar do truck), e a coluna já a mostra como "+ ABC1D23" — copiar sem ela deixaria de
   * fora exatamente o caso que o faturamento precisa enxergar.
   *
   * REPETIDA NÃO É REMOVIDA: o mesmo cavalo pode puxar duas LHs no dia, e a lista tem de bater linha
   * a linha com o que está na tela. Quem quiser sem repetição remove na planilha em dois cliques;
   * quem precisa conferir contra a tela não teria como recuperar o que foi retirado aqui.
   */
  const placasNaTela = useMemo(
    () =>
      porDia
        .flatMap(([, linhasDoDia]) =>
          linhasDoDia.map((l) => [
            ...(l.placa ?? "")
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean),
            ...(l.placaInterna ? [l.placaInterna.trim()] : []),
          ]),
        )
        // LH sem placa nenhuma não vira linha em branco na planilha.
        .filter((placasDaLh) => placasDaLh.length > 0),
    [porDia],
  );

  /** Quantas LHs geraram essas placas — o botão diz os dois números, senão um deles mente. */
  const viagensNaTela = useMemo(
    () => porDia.reduce((n, [, linhasDoDia]) => n + linhasDoDia.length, 0),
    [porDia],
  );

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

          <CopiarPlacas placas={placasNaTela} viagens={viagensNaTela} />

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

          {/*
            O TOTAL E O FIM DA JANELA, LADO A LADO — e o segundo é o que faltava (2026-09-04).

            "142 viagens" sem dizer ATÉ QUANDO é a metade da frase que importa. Em 04/09 a operação
            conferiu dez LHs à mão e concluiu que o TMS não recebia; as dez tinham coleta oito dias à
            frente, fora de uma janela que a tela nunca mencionou.

            Aqui, e não só dentro do painel de filtros: o painel abre fechado, e um aviso que só
            aparece para quem procura não avisa ninguém.
          */}
          <span className="text-muted-foreground ml-auto text-xs">
            {t("totalLinhas", { n: visiveis.length })} ·{" "}
            {t("deAte", { de: janela.inicio, ate: janela.fim })}
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

              {/*
                ATÉ ONDE O QUADRO VAI — a tela passou a dizer (2026-09-04).

                A janela sempre foi fixa e a tela nunca contou isso. Em 04/09 a operação conferiu DEZ
                LHs à mão, uma a uma, e concluiu que o TMS não estava recebendo. As dez estavam no
                banco, carimbadas pelo robô minutos antes — a coleta era oito e nove dias à frente,
                fora de uma borda que ninguém via.

                Esticar a janela chegou a ser uma escolha na tela, e o usuário preferiu voltar ao
                fixo. A borda continua existindo; o que não pode é ela ser invisível — e é por isso
                que esta frase fica, mesmo sem o controle ao lado.
              */}
              <div className="space-y-2 border-t pt-2">
                <p className="text-muted-foreground text-xs">
                  {t("ateQuandoVai", { de: janela.inicio, ate: janela.fim })}
                </p>
              </div>

              {/*
                AS COLUNAS MORAM NO MESMO PAINEL QUE OS DIAS E O STATUS (2026-09-04, a pedido).

                São a mesma pergunta feita de três jeitos — "o que eu não quero ver agora" —, e um
                segundo botão ao lado do primeiro faria a pessoa lembrar em qual dos dois está cada
                escolha. Aqui é um lugar só: abriu, escolhe o que sobra na tela.

                Marcado = à vista. Desmarcado e riscado = escondido, igual aos dias logo acima: a
                gramática do painel é a mesma de cima a baixo.
              */}
              <div className="space-y-2 border-t pt-2">
                <p className="text-muted-foreground text-xs">{t("quaisColunas")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {COLUNAS_OCULTAVEIS.map((coluna) => {
                    const escondida = colunasEscondidas.has(coluna);
                    return (
                      <button
                        key={coluna}
                        type="button"
                        aria-pressed={!escondida}
                        onClick={() => alternarColuna(coluna)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          escondida
                            ? "text-muted-foreground line-through opacity-60"
                            : "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {t(coluna)}
                      </button>
                    );
                  })}
                </div>
                {colunasEscondidas.size > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setColunasEscondidas(new Set());
                      lembrar({ colunas: [] });
                    }}
                  >
                    {t("verTodasAsColunas")}
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
                  {/*
                    CADA COLUNA PERGUNTA SE DEVE APARECER (2026-09-04, a pedido).

                    `mostrar` lê a mesma preferência que o painel escreve, e o corpo da linha usa a
                    MESMA função — se cabeçalho e célula divergissem, a tabela sairia com uma coluna
                    a mais num lado e o alinhamento inteiro andaria.
                  */}
                  {mostrar("statusOperacional") ? (
                    <TableHead className="w-24">{t("statusOperacional")}</TableHead>
                  ) : null}
                  {/* SM e CTE: duas perguntas independentes, uma coluna cada. */}
                  {mostrar("sm") ? <TableHead className="w-16">{t("sm")}</TableHead> : null}
                  {mostrar("cte") ? <TableHead className="w-16">{t("cte")}</TableHead> : null}
                  <TableHead>{t("lh")}</TableHead>
                  {mostrar("rota") ? <TableHead>{t("rota")}</TableHead> : null}
                  {mostrar("etaOrigem") ? <TableHead>{t("etaOrigem")}</TableHead> : null}
                  {mostrar("cptOrigem") ? <TableHead>{t("cptOrigem")}</TableHead> : null}
                  {mostrar("etaDestino") ? <TableHead>{t("etaDestino")}</TableHead> : null}
                  {mostrar("perfil") ? <TableHead>{t("perfil")}</TableHead> : null}
                  {mostrar("status") ? <TableHead>{t("status")}</TableHead> : null}
                  {mostrar("motorista") ? <TableHead>{t("motorista")}</TableHead> : null}
                  {mostrar("placa") ? <TableHead>{t("placa")}</TableHead> : null}
                  {mostrar("contato") ? <TableHead>{t("contato")}</TableHead> : null}
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
                    className={cn("group", classeDaCor(l.cor))}
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
                    {mostrar("statusOperacional") ? (
                      <TableCell className="p-1">
                        {/*
                          O SM SAIU DAQUI e virou COLUNA (2026-09-04, a pedido).

                          Ele morava colado no status porque nasceu como um selo. Virando marcação de
                          um clique, e ganhando um irmão (o CTE), os dois pedem coluna com título — um
                          par de ícones sem cabeçalho no meio da linha não diz o que está marcando.
                        */}
                        <StatusDaLinha
                          tripId={l.tripId}
                          status={l.statusOperacional}
                          podeMarcar={podeAtribuir}
                        />
                      </TableCell>
                    ) : null}

                    {mostrar("sm") ? (
                      <TableCell className="p-1">
                        <MarcaDaLinha
                          tripId={l.tripId}
                          valor={l.sm}
                          campo="sm"
                          podeMarcar={podeMarcarSm}
                        />
                      </TableCell>
                    ) : null}
                    {mostrar("cte") ? (
                      <TableCell className="p-1">
                        <MarcaDaLinha
                          tripId={l.tripId}
                          valor={l.cte}
                          campo="cte"
                          podeMarcar={podeMarcarCte}
                        />
                      </TableCell>
                    ) : null}

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
                        O RAIO MARCA A LH QUE VEIO DE LEILÃO (2026-09-04, a pedido).

                        Medido no dia: 27 das 69 viagens de dois dias vieram de oferta de spot — 39%.
                        Elas se pagam e se cobram diferente, e até aqui só dava para saber abrindo
                        uma por uma.

                        Um ÍCONE e não uma coluna: a linha já tem quinze colunas, e isto é um sim/não
                        que só interessa quando é sim. Colado no número da LH porque é sobre ELA — em
                        qualquer outro canto viraria um símbolo solto que ninguém sabe a que se
                        refere.
                      */}
                      {l.veioDeSpot ? (
                        <span
                          title={t("veioDeSpot")}
                          aria-label={t("veioDeSpot")}
                          className="ml-1 inline-flex items-center align-middle text-amber-600 dark:text-amber-400"
                        >
                          <Zap className="size-3" aria-hidden />
                        </span>
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
                    {mostrar("rota") ? (
                      <TableCell className="whitespace-nowrap text-xs">
                        {l.origem ?? "—"}
                        <span className="px-1 text-muted-foreground">→</span>
                        {l.destino ?? "—"}
                      </TableCell>
                    ) : null}
                    {mostrar("etaOrigem") ? (
                      <TableCell className="whitespace-nowrap text-xs tabular-nums">
                        {l.etaOrigem ?? "—"}
                      </TableCell>
                    ) : null}
                    {mostrar("cptOrigem") ? (
                      <TableCell className="whitespace-nowrap text-xs tabular-nums">
                        {l.cptOrigem ?? "—"}
                      </TableCell>
                    ) : null}
                    {mostrar("etaDestino") ? (
                      <TableCell className="whitespace-nowrap text-xs tabular-nums">
                        {l.etaDestino ?? "—"}
                      </TableCell>
                    ) : null}
                    {mostrar("perfil") ? (
                      <TableCell className="text-xs uppercase">{l.perfil ?? "—"}</TableCell>
                    ) : null}
                    {mostrar("status") ? (
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
                    ) : null}
                    {/*
                      O PREVISTO OCUPA A CÉLULA ENQUANTO ELA ESTIVER VAZIA (2026-08-26, a pedido).
                      Não é uma coluna nova: duas colunas de motorista lado a lado obrigariam quem
                      olha a decidir qual vale, toda linha, para sempre. Aqui a célula diz uma coisa
                      só — o que está escalado, ou, na falta dele, o que se pretende. O selo em
                      cinza e o itálico existem para que ninguém confunda intenção com ordem.
                    */}
                    {mostrar("motorista") ? (
                      <TableCell className="text-xs">
                        {l.motorista ? (
                          <span className="inline-flex items-center gap-1">
                            {l.motorista}
                            <SeloDeVinculo
                              vinculo={l.vinculo}
                              driverId={l.driverId}
                              podeEditar={podeEditarVinculo}
                            />
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
                          O SEGUNDO MOTORISTA, EMBAIXO DO PRIMEIRO (2026-09-04, a pedido).

                          Ele vinha na mesma listagem do portal desde sempre e era descartado no
                          mapeador. Numa viagem de dois, mostrar só um é meia informação: quem escala
                          não tem como saber se a dupla está fechada ou se ainda falta gente.

                          Só desenha quando existe. Um "—" fixo diria "não tem segundo" sobre quase
                          todas as viagens, e uma linha a mais em cada uma delas — ruído em troca de
                          nada, numa tabela que já tem quinze colunas.

                          O "2º" na frente é o que evita a leitura errada: sem ele, dois nomes
                          empilhados parecem o mesmo campo repetido ou um nome que quebrou de linha.
                        */}
                        {l.segundoMotorista ? (
                          <span className="text-muted-foreground flex items-center gap-1 text-[0.7rem]">
                            <span className="font-semibold">2º</span>
                            {l.segundoMotorista}
                            <Copiar valor={l.segundoMotorista} rotulo={t("copiarMotorista")} />
                          </span>
                        ) : null}
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
                    ) : null}
                    {mostrar("placa") ? (
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
                    ) : null}
                    {mostrar("contato") ? (
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
                    ) : null}
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
 * A MARCA DA LINHA — o V e o X de SM e de CTE (2026-09-04, a pedido).
 *
 * Um componente para os dois porque são o mesmo gesto sobre campos diferentes: se um ganhasse um
 * comportamento que o outro não tem, a linha passaria a se comportar de dois jeitos em duas colunas
 * vizinhas — e ninguém saberia dizer qual é a certa.
 *
 * O gancho é escolhido pelo campo, e não recebido de fora: quem usa a coluna diz O QUE está
 * marcando, não COMO gravar. É o que impede a tela de chamar o gancho errado.
 */
function MarcaDaLinha({
  tripId,
  valor,
  campo,
  podeMarcar,
}: {
  tripId: string;
  valor: boolean | null;
  campo: "sm" | "cte";
  podeMarcar: boolean;
}) {
  const t = useTranslations("Programacao");
  const marcarSm = useMarcarSm(tripId);
  const marcarCte = useMarcarCte(tripId);
  const marcar = campo === "sm" ? marcarSm : marcarCte;

  return (
    <MarcaVouX
      valor={valor}
      podeMarcar={podeMarcar}
      aoMarcar={(v) => marcar.mutate(v)}
      rotuloSim={t(campo === "sm" ? "smSim" : "cteSim")}
      rotuloNao={t(campo === "sm" ? "smNao" : "cteNao")}
    />
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
 * COPIAR TODAS AS PLACAS DO QUE ESTÁ NA TELA (2026-09-02, a pedido).
 *
 * ── UMA POR LINHA, E O SEPARADOR É A DECISÃO INTEIRA ──────────────────────────────────────────
 *
 * O destino é uma COLUNA de planilha. Vírgula ou ponto-e-vírgula cairiam numa célula só, e quem cola
 * teria de separar à mão — que é o trabalho que este botão existe para tirar. A quebra de linha é o
 * que faz cada placa virar uma linha da planilha.
 *
 * ── O BOTÃO CONTA AS DUAS COISAS ──────────────────────────────────────────────────────────────
 *
 * "18 placas · 11 LHs". Um número só mentiria: como a maioria das viagens tem cavalo E carreta, a
 * lista sai maior que o número de viagens, e quem lesse "11" esperaria 11 linhas na planilha.
 *
 * ── SEM PLACA, SEM BOTÃO ──────────────────────────────────────────────────────────────────────
 *
 * Um botão que copia lista vazia parece quebrado. Ele some quando o filtro não deixou placa nenhuma.
 *
 * A confirmação é o próprio rótulo virando "copiado" por dois segundos, como no `Copiar` da linha —
 * um aviso flutuante para uma ação desta seria mais interrupção do que informação.
 */
/**
 * OS DOIS SEPARADORES DA CÓPIA, escritos com escape e não com o caractere de verdade.
 *
 * Uma TABULAÇÃO literal no meio do código é invisível: some numa formatação automática, num
 * copiar-e-colar, ou vira espaço sem ninguém notar — e o sintoma seria a colagem parando de cair em
 * duas colunas, sem nada no diff que explique.
 *
 * A tabulação é o que a planilha lê como "próxima coluna"; a quebra, como "próxima linha".
 */
const SEPARADOR_DE_COLUNA = "\t";
const QUEBRA_DE_LINHA = "\n";

function CopiarPlacas({ placas, viagens }: { placas: string[][]; viagens: number }) {
  const t = useTranslations("Programacao");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const id = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(id);
  }, [copiado]);

  if (placas.length === 0) return null;

  /*
    TABULAÇÃO ENTRE AS PLACAS DA MESMA LH, QUEBRA ENTRE AS LHs (2026-09-04, a pedido).

    A tabulação é o que faz a colagem cair em COLUNAS VIZINHAS da planilha — cavalo numa célula,
    carreta na outra. Vírgula ou espaço jogariam as duas na mesma célula, e alguém teria de separar à
    mão exatamente o que copiar veio eliminar.
  */
  const texto = placas.map((daLh) => daLh.join(SEPARADOR_DE_COLUNA)).join(QUEBRA_DE_LINHA);
  const quantas = placas.reduce((n, daLh) => n + daLh.length, 0);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8"
      onClick={() => {
        void navigator.clipboard
          .writeText(texto)
          .then(() => setCopiado(true))
          .catch(() => setCopiado(false));
      }}
    >
      {copiado ? (
        <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
      ) : (
        <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />
      )}
      {copiado
        ? t("placasCopiadas", { placas: quantas })
        : t("copiarPlacasDoFiltro", { placas: quantas, viagens })}
    </Button>
  );
}
