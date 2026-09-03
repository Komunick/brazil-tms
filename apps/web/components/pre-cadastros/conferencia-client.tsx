"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ExternalLink,
  FileImage,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldQuestion,
} from "lucide-react";
import {
  decidirPedidoDePesquisa,
  formatDateTime,
  motivosDeNaoCadastrar,
  SITUACAO_DA_PESQUISA,
  type CampoDoCadastro,
  type CamposDoPreCadastro,
  type PesquisaEncontrada,
} from "@brazil-tms/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { avisar } from "@/lib/ui/avisos";
import { cn } from "@/lib/utils";

/**
 * A CONFERÊNCIA — documento de um lado, campos do outro (fatia 028, etapa 4).
 *
 * É a tela que a spec pediu desde o começo e que só agora existe: a pessoa CONFERE, corrige o que
 * estiver errado, e manda. Antes disto a leitura da CNH terminava e o cadastro seguia sozinho para a
 * gerenciadora — o que funcionava e estava errado, porque uma leitura COMPLETA e ERRADA (um dígito
 * trocado num RG) é plausível o bastante para passar por todos os bloqueios sem ninguém ver.
 *
 * ── É O ÚNICO CAMINHO ATÉ A GERENCIADORA ──────────────────────────────────────────────────────
 *
 * Não sobrou outro gatilho para o envio. "Alguém viu" deixou de ser disciplina e virou estrutura.
 *
 * ── O DOCUMENTO FICA AO LADO, NÃO NUMA ABA ────────────────────────────────────────────────────
 *
 * Conferir é comparar. Com o documento numa aba separada, a pessoa alterna, memoriza e erra — e o
 * erro que ela cometeria é exatamente o que a tela existe para pegar.
 *
 * ── O QUE FALTA VEM DA MESMA FUNÇÃO QUE O ENVIO USA ───────────────────────────────────────────
 *
 * `motivosDeNaoCadastrar` é pura e mora em `packages/shared`, então roda aqui igual roda no worker.
 * Uma segunda lista de "campos obrigatórios" nesta tela divergiria da real no primeiro campo que
 * alguém acrescentasse ao `setMotorista` — e divergiria em silêncio, dizendo "pronto para enviar"
 * sobre um cadastro que a gerenciadora recusa.
 */

interface Conferencia {
  id: string;
  cpf: string;
  tipo: "novo" | "atualizacao";
  motoristaNome: string | null;
  nome: string | null;
  campos: CamposDoPreCadastro;
  leituraCnh: { estado: string; motivo?: string; cpfDivergente?: string } | null;
  documentoCnhId: string | null;
  documentoComprovanteId: string | null;
  documentoCnhTipo: string | null;
  pendenciaToxicologico: boolean;
  enviadoEm: string | null;
  cadastro: { em: string; motivos?: string[]; erro?: string } | null;
  /** O pedido de pesquisa — a metade cobrada. Presente = já foi pedida, não peça de novo. */
  pesquisa: {
    em: string;
    motivos?: string[];
    erro?: string;
    situacao?: string | null;
    acabou?: boolean;
    resposta?: Record<string, unknown>;
  } | null;
  /**
   * O QUE A GERENCIADORA JÁ SABE — leitura de graça (2026-09-03).
   *
   * Nulo quer dizer "ninguém perguntou", e não "não há nada lá". A tela precisa dos dois estados
   * separados: o primeiro pede um clique, o segundo é o que autoriza gastar.
   */
  conferencia: {
    em: string;
    cadastrado: boolean;
    codigoNaGerenciadora: number | null;
    pesquisas: PesquisaEncontrada[];
    erro?: string;
  } | null;
  recebidoEm: string;
}

/**
 * OS CAMPOS AGRUPADOS COMO A CNH OS APRESENTA.
 *
 * A ordem não é estética: ela segue o documento, para o olho descer a foto e a coluna juntos. Uma
 * lista alfabética faria a pessoa procurar cada campo — e conferir vinte campos procurando cada um
 * é o que faz alguém parar de conferir de verdade na terceira linha da fila.
 *
 * QUAIS campos existem é decisão de `CAMPOS_DO_CADASTRO`, em `packages/shared`, que a rota de salvar
 * também usa para recusar chave desconhecida. Aqui só se decide a ORDEM e o agrupamento — e um teste
 * garante que os grupos cobrem a lista inteira, para um campo novo não sumir da tela em silêncio.
 */
export const GRUPOS: { titulo: string; campos: CampoDoCadastro[] }[] = [
  {
    titulo: "pessoais",
    campos: ["nome", "cpf", "dataNascimento", "sexo", "nomeMae", "cidadeNatal", "ufNatal"],
  },
  { titulo: "identidade", campos: ["rg", "orgaoEmissorRg", "ufEmissorRg"] },
  {
    titulo: "habilitacao",
    campos: [
      "numeroRegistro",
      "categoria",
      "validade",
      "primeiraHabilitacao",
      "numeroFormulario",
      "numeroSeguranca",
      "renach",
    ],
  },
  {
    titulo: "endereco",
    campos: ["cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf"],
  },
  { titulo: "contato", campos: ["celular", "possuiMopp", "validadeMopp"] },
];

const TODOS_OS_CAMPOS = GRUPOS.flatMap((g) => g.campos);

/** A sigla da gerenciadora por extenso — `AD` sozinho não diz nada a quem lê a tela. */
function situacaoLegivel(situacao: string | undefined): string {
  if (!situacao) return "";
  return SITUACAO_DA_PESQUISA[situacao] ?? situacao;
}

/**
 * A VALIDADE DA PESQUISA — `2027-03-01` vira `01/03/2027`, sem passar por fuso.
 *
 * `formatDate` NÃO serve aqui, e o motivo é sutil: ela existe para INSTANTES gravados em UTC e
 * converte para São Paulo. Uma data pura entraria como meia-noite UTC e sairia como o dia
 * ANTERIOR — a pesquisa que vale até 01/03 apareceria valendo até 28/02.
 *
 * Isto aqui não é um instante: é o dia que a gerenciadora escreveu. Não há hora para converter.
 */
function dataPuraBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * O QUE IMPEDIU A APROVAÇÃO, por extenso.
 *
 * A gerenciadora devolve uma lista com código e descrição — "nº do RENAVAM incorreto", "favor
 * anexar no sistema a cópia atualizada do documento". É a informação que hoje só existe abrindo a
 * tela deles, e é ela que diz o que fazer.
 *
 * Devolve vazio quando não há: um `title` vazio some sozinho, e um "sem justificativas" seria
 * ruído em cima da imensa maioria dos casos, que são os aprovados.
 */
function justificativasDe(resposta: Record<string, unknown> | undefined): string | undefined {
  const lista = (resposta?.Justificativas ?? []) as { Descricao?: string }[];
  if (!Array.isArray(lista) || lista.length === 0) return undefined;
  return lista
    .map((j) => j?.Descricao)
    .filter(Boolean)
    .join("\n\n");
}

export function ConferenciaClient({ id }: { id: string }): React.ReactElement {
  const t = useTranslations("PreCadastros");
  const queryClient = useQueryClient();
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  const consulta = useQuery({
    queryKey: ["pre-cadastro", id],
    queryFn: async () => {
      const res = await fetch(`/api/pre-cadastros/${id}`);
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as Conferencia;
    },
    refetchInterval: 20_000,
  });

  const item = consulta.data;

  /**
   * O rascunho nasce do servidor UMA VEZ, e o polling não o atropela.
   *
   * Sem esta guarda, alguém digitando o RG teria o campo limpo de volta a cada vinte segundos — e
   * pareceria que a tela apaga o que a pessoa escreve.
   */
  useEffect(() => {
    if (!item) return;
    setRascunho((atual) => {
      if (Object.keys(atual).length > 0) return atual;
      const inicial: Record<string, string> = {};
      for (const c of TODOS_OS_CAMPOS) inicial[c] = item.campos[c]?.valor ?? "";
      return inicial;
    });
  }, [item]);

  /** Os campos como ficariam se salvos — é sobre eles que "o que falta" é calculado. */
  const camposAtuais = useMemo<CamposDoPreCadastro>(() => {
    const base: CamposDoPreCadastro = { ...(item?.campos ?? {}) };
    for (const [chave, valor] of Object.entries(rascunho)) {
      const limpo = valor.trim();
      const anterior = item?.campos[chave]?.valor ?? null;
      if (limpo === (anterior ?? "")) continue;
      base[chave] =
        limpo === "" ? { valor: null, origem: null } : { valor: limpo, origem: "digitado" };
    }
    return base;
  }, [item, rascunho]);

  /**
   * Os IBGE entram como PRESENTES de propósito.
   *
   * Resolvê-los exige o catálogo de 5.571 municípios da gerenciadora, que só o worker alcança. Fingir
   * que faltam mostraria dois avisos permanentes que ninguém pode resolver aqui, e a tela ensinaria a
   * ignorar os avisos dela. Quando o envio acontece, o worker resolve de verdade e a recusa por
   * cidade não encontrada volta pelo selo do resultado.
   */
  const faltando = useMemo(
    () =>
      item
        ? motivosDeNaoCadastrar({
            campos: camposAtuais,
            codIbgeNatal: 1,
            codIbgeResidencia: 1,
            cpfDivergente: Boolean(item.leituraCnh?.cpfDivergente),
            /**
             * OS ANEXOS: aqui a tela SABE, ao contrário do IBGE.
             *
             * Ela não tem o conteúdo em Base64 — quem baixa é o worker —, mas tem os ids, e é
             * disso que depende o bloqueio: faltar arquivo é faltar id. Um marcador de um byte
             * por documento presente diz "existe" sem fingir tamanho, e o teto continua sendo
             * conferido lá, sobre os bytes de verdade.
             *
             * Diferente do IBGE justamente por isso: lá a tela fingiria saber algo que só o
             * catálogo da gerenciadora responde; aqui ela responde com o que tem na mão.
             */
            documentos: [item.documentoCnhId, item.documentoComprovanteId]
              .filter(Boolean)
              .map((_, i) => ({ Descricao: String(i), Extensao: "PDF", Documento: "." })),
          })
        : [],
    [item, camposAtuais],
  );

  const sujo = useMemo(() => {
    if (!item) return false;
    return Object.entries(rascunho).some(
      ([chave, valor]) => valor.trim() !== (item.campos[chave]?.valor ?? ""),
    );
  }, [item, rascunho]);

  const salvar = useMutation({
    mutationFn: async () => {
      const campos: Record<string, string | null> = {};
      for (const [chave, valor] of Object.entries(rascunho)) campos[chave] = valor.trim() || null;
      const res = await fetch(`/api/pre-cadastros/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campos }),
      });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { mudou: string[] };
    },
    onSuccess: async (r) => {
      avisar({ tipo: "ok", texto: t("salvo", { n: r.mudou.length }) });
      await queryClient.invalidateQueries({ queryKey: ["pre-cadastro", id] });
      await queryClient.invalidateQueries({ queryKey: ["pre-cadastros"] });
    },
    onError: () => avisar({ tipo: "erro", texto: t("salvarFalhou") }),
  });

  /**
   * SALVA ANTES DE MANDAR, sempre — e não é conveniência.
   *
   * O worker lê do BANCO, não da tela. Enviar com correções ainda no rascunho mandaria à
   * gerenciadora exatamente a versão que a pessoa acabou de corrigir, e ela veria na tela o valor
   * certo ao lado de um cadastro criado com o errado.
   */
  const enviar = useMutation({
    mutationFn: async () => {
      if (sujo) {
        const campos: Record<string, string | null> = {};
        for (const [chave, valor] of Object.entries(rascunho)) campos[chave] = valor.trim() || null;
        const s = await fetch(`/api/pre-cadastros/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campos }),
        });
        if (!s.ok) throw new Error(String(s.status));
      }
      const res = await fetch(`/api/pre-cadastros/${id}/enviar`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: async () => {
      avisar({ tipo: "ok", texto: t("envioPedido") });
      await queryClient.invalidateQueries({ queryKey: ["pre-cadastro", id] });
      await queryClient.invalidateQueries({ queryKey: ["pre-cadastros"] });
    },
    onError: () => avisar({ tipo: "erro", texto: t("envioFalhou") }),
  });

  /**
   * A CONFERÊNCIA — a mutação de graça que existe para a de baixo não gastar à toa.
   *
   * A gerenciadora não bloqueia pesquisa repetida (usuário, 03/09): mandar duas vezes cria duas e
   * cobra as duas, sem erro nenhum. Esta pergunta é o que impede isso, e ela não custa — só tempo.
   *
   * O aviso fala em "cerca de um minuto e meio" porque é a verdade medida: são quatro chamadas em
   * série, e a Integra recusa chamadas próximas demais com 30 s de espera entre elas. Dizer "em
   * instantes" faria alguém achar que quebrou e clicar de novo.
   */
  const conferir = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pre-cadastros/${id}/conferir-raster`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: () => avisar({ tipo: "ok", texto: t("conferenciaPedida") }),
    onError: () => avisar({ tipo: "erro", texto: t("conferenciaFalhou") }),
  });

  const [pedindoPesquisa, setPedindoPesquisa] = useState(false);
  /**
   * ⚠️ A ÚNICA MUTAÇÃO DESTA TELA QUE GASTA DINHEIRO.
   *
   * O aviso diz "pedida", não "feita": a rota devolve 202 e a cobrança acontece quando o worker
   * chamar. E o resultado — código, situação e o link de photocheck, quando houver — aparece no
   * polling, que é onde ele é verdade.
   */
  const pesquisar = useMutation({
    mutationFn: async (escolhas: {
      vinculo: "F" | "A" | "T";
      expressa: boolean;
      pesquisaPlus: boolean;
      biometrica: boolean;
    }) => {
      const res = await fetch(`/api/pre-cadastros/${id}/pesquisa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(escolhas),
      });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: async () => {
      avisar({ tipo: "ok", texto: t("pesquisaPedida") });
      await queryClient.invalidateQueries({ queryKey: ["pre-cadastro", id] });
    },
    onError: () => avisar({ tipo: "erro", texto: t("pesquisaFalhou") }),
  });

  if (consulta.isLoading) return <Skeleton className="h-96 w-full" />;
  if (!item) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-10 text-center text-sm">
          {t("naoEncontrado")}
        </CardContent>
      </Card>
    );
  }

  const jaFoi = Boolean(item.enviadoEm);

  /*
    A MESMA FUNÇÃO QUE O WORKER USARIA, e não uma regra escrita de novo aqui.

    Ela é pura e mora em `packages/shared`. Uma segunda leitura do que "conta como pesquisa válida"
    nesta tela divergiria da real no dia em que a gerenciadora acrescentasse uma situação — e
    divergiria para o lado caro, liberando o botão sobre uma pesquisa que já existe.
  */
  const decisao = decidirPedidoDePesquisa(item.conferencia?.pesquisas ?? []);
  const rotulo = (c: string): string => (t.has(`campo.${c}`) ? t(`campo.${c}`) : c);
  const faltandoLegivel = (c: string): string => (t.has(`faltando.${c}`) ? t(`faltando.${c}`) : c);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/pre-cadastros">
            <ArrowLeft />
            {t("voltarAFila")}
          </Link>
        </Button>
        <span className="font-medium">{item.nome ?? t("semNome")}</span>
        <Badge variant={item.tipo === "atualizacao" ? "secondary" : "outline"}>
          {item.tipo === "atualizacao"
            ? `${t("atualizacao")}${item.motoristaNome ? ` · ${item.motoristaNome}` : ""}`
            : t("cadastroNovo")}
        </Badge>
        {/* A divergência de CPF vem em vermelho e não some: é o único aviso que muda o que se FAZ. */}
        {item.leituraCnh?.cpfDivergente ? (
          <Badge
            variant="destructive"
            title={t("cpfDivergenteDetalhe", { cpf: item.leituraCnh.cpfDivergente })}
          >
            {t("cpfDivergente")}
          </Badge>
        ) : null}
        {jaFoi ? (
          <Badge variant="secondary" className="text-emerald-700 dark:text-emerald-400">
            {t("enviadoEm", { data: formatDateTime(item.enviadoEm!) })}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* O DOCUMENTO. Fica grudado ao rolar: a coluna de campos é longa e o olho precisa dos dois. */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardContent className="space-y-2 p-3">
              {item.documentoCnhId ? (
                <>
                  {item.documentoCnhTipo?.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL assinada de 30s, fora do otimizador.
                    <img
                      src={`/api/pre-cadastros/documento/${item.documentoCnhId}`}
                      alt={t("cnh")}
                      className="max-h-[70vh] w-full rounded object-contain"
                    />
                  ) : (
                    <object
                      data={`/api/pre-cadastros/documento/${item.documentoCnhId}`}
                      type={item.documentoCnhTipo ?? "application/pdf"}
                      className="h-[70vh] w-full rounded"
                    >
                      {/* Navegador sem visualizador de PDF: o link continua funcionando. */}
                      <p className="text-muted-foreground p-4 text-sm">{t("semVisualizador")}</p>
                    </object>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`/api/pre-cadastros/documento/${item.documentoCnhId}`}
                        target="_blank"
                        rel="noopener"
                      >
                        <ExternalLink />
                        {t("abrirCnh")}
                      </a>
                    </Button>
                    {item.documentoComprovanteId ? (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={`/api/pre-cadastros/documento/${item.documentoComprovanteId}`}
                          target="_blank"
                          rel="noopener"
                        >
                          <FileImage />
                          {t("comprovante")}
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground p-4 text-sm">{t("semDocumento")}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {GRUPOS.map((grupo) => (
            <Card key={grupo.titulo}>
              <CardContent className="space-y-3 py-4">
                <h2 className="text-sm font-semibold">{t(`grupo.${grupo.titulo}`)}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {grupo.campos.map((campo) => {
                    const origem = camposAtuais[campo]?.origem ?? null;
                    const vazio = !(rascunho[campo] ?? "").trim();
                    return (
                      <div key={campo} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-sm font-medium" htmlFor={`campo-${campo}`}>
                            {rotulo(campo)}
                          </label>
                          {/*
                            A PROCEDÊNCIA ao lado do campo, e é o que torna a conferência rápida:
                            um valor `cnh` merece o olho no documento, um `digitado` já passou por
                            alguém, e um vazio é o que interrompe. Sem isso a pessoa reconferiria
                            os vinte campos toda vez.
                          */}
                          {origem ? (
                            <span className="text-muted-foreground text-[11px] uppercase">
                              {t.has(`origem.${origem}`) ? t(`origem.${origem}`) : origem}
                            </span>
                          ) : null}
                        </div>
                        <Input
                          id={`campo-${campo}`}
                          value={rascunho[campo] ?? ""}
                          disabled={jaFoi}
                          onChange={(e) => setRascunho((r) => ({ ...r, [campo]: e.target.value }))}
                          className={vazio ? "border-amber-500 dark:border-amber-400" : undefined}
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/*
        O RETRATO DA GERENCIADORA — o que ela respondeu, e QUANDO.

        Ele fica logo acima da barra de ação, ao alcance do olho de quem vai decidir gastar. Só
        aparece depois de alguém perguntar: um bloco permanente dizendo "nunca conferido" seria uma
        acusação em toda tela, inclusive nas dezenas em que conferir não vem ao caso.

        A HORA APARECE SEMPRE porque a resposta envelhece: uma pesquisa `EP` vira `AD` sozinha do
        lado deles, e um retrato de ontem diria "espere" sobre algo que já terminou. Sem a hora, a
        tela pareceria estar dizendo a verdade de agora.
      */}
      {item.conferencia ? (
        <Card>
          <CardContent className="space-y-2 py-3 text-sm">
            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
              <ShieldQuestion className="size-3.5" />
              {t("conferenciaEm", { quando: formatDateTime(item.conferencia.em) })}
            </div>
            {item.conferencia.erro ? (
              <p className="text-destructive">
                {t("conferenciaErro", { erro: item.conferencia.erro })}
              </p>
            ) : (
              <>
                <p>
                  {item.conferencia.cadastrado
                    ? t("conferenciaCadastrado", {
                        codigo: item.conferencia.codigoNaGerenciadora ?? 0,
                      })
                    : t("conferenciaNaoCadastrado")}
                </p>
                {item.conferencia.pesquisas.length === 0 ? (
                  <p className="text-muted-foreground">{t("conferenciaSemPesquisa")}</p>
                ) : (
                  <ul className="space-y-1">
                    {item.conferencia.pesquisas.map((pq) => (
                      <li key={`${pq.vinculo}-${pq.codigo}`} className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {t("conferenciaPesquisaLinha", {
                            vinculo: pq.vinculo,
                            situacao: situacaoLegivel(pq.situacao),
                            codigo: pq.codigo,
                          })}
                        </Badge>
                        {pq.dataExpiracao ? (
                          <span className="text-muted-foreground">
                            {t("conferenciaPesquisaValidade", {
                              data: dataPuraBr(pq.dataExpiracao),
                            })}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* A BARRA DE AÇÃO fica grudada embaixo: a coluna de campos é longa, e um botão de enviar que
          exige rolar até o fim é um botão que alguém aperta sem ter chegado ao fim. */}
      <div className="bg-background/95 sticky bottom-0 flex flex-wrap items-center gap-3 border-t py-3 backdrop-blur">
        {item.cadastro?.erro ? (
          <span className="text-destructive text-sm">{item.cadastro.erro}</span>
        ) : faltando.length > 0 ? (
          <span className="text-sm text-amber-700 dark:text-amber-400">
            {t("faltam", {
              n: faltando.length,
              quais: faltando.map(faltandoLegivel).join(", "),
            })}
          </span>
        ) : (
          <span className="text-sm text-emerald-700 dark:text-emerald-400">{t("nadaFalta")}</span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={jaFoi || !sujo || salvar.isPending}
            onClick={() => salvar.mutate()}
          >
            <Save />
            {t("salvar")}
          </Button>
          {/*
            O ENVIO FICA DISPONÍVEL MESMO COM CAMPO FALTANDO, e isso é deliberado.

            O que falta aqui é o cálculo desta tela, sem os dois códigos IBGE que só o worker
            resolve. Travar o botão por ele faria a tela ter a palavra final sobre uma regra que ela
            não conhece inteira — e o caso em que erraria é o único que importa: um cadastro pronto
            que a tela julga incompleto e ninguém consegue mandar.

            Quem recusa de verdade é o worker, com a regra completa, e a recusa volta escrita.
          */}
          <Button disabled={jaFoi || enviar.isPending} onClick={() => enviar.mutate()}>
            <Send />
            {t("enviarParaGerenciadora")}
          </Button>
          {/*
            CONFERIR NA GERENCIADORA — de graça, e por isso sem cerimônia nenhuma.

            Ele fica DO LADO do botão que gasta de propósito: é o gesto que se faz antes. E não
            some depois de usado, ao contrário do de pesquisa, porque a resposta envelhece — uma
            pesquisa `EP` vira `AD` sozinha do lado deles.

            POR QUE NÃO É AUTOMÁTICO ao abrir a tela: a resposta demora perto de um minuto e meio
            (quatro chamadas em série, com a espera de 30 s que a Integra impõe entre elas). Rodar
            sozinho penduraria toda abertura de pré-cadastro por isso. Decisão do usuário, 03/09.
          */}
          <Button
            variant="outline"
            disabled={conferir.isPending}
            onClick={() => conferir.mutate()}
            title={t("conferirNaRasterAjuda")}
          >
            {conferir.isPending ? <RefreshCw className="animate-spin" /> : <ShieldQuestion />}
            {conferir.isPending ? t("conferindo") : t("conferirNaRaster")}
          </Button>
          {/*
            A PESQUISA SÓ APARECE DEPOIS DO ENVIO, e é o inverso do botão ao lado.

            Enviar é de graça e não some depois de feito; pedir pesquisa CUSTA e some assim que foi
            pedida. Um botão de gastar que continua ali depois de usado é um convite a gastar duas
            vezes — e a trava de verdade está no banco, mas a tela não deve empurrar para ela.

            Antes do envio ele nem existe: não há a quem pesquisar na gerenciadora, e mostrar o botão
            desabilitado só faria alguém perguntar por que não funciona.
          */}
          {/*
            O RESULTADO DA PESQUISA, ao lado dos botões.

            Sem ele o job agendado seria código morto: ele busca de graça a cada meia hora, e se
            ninguém vê o que ele trouxe, a pessoa continua abrindo a tela da gerenciadora — que é
            exatamente a ida e volta que a fatia veio eliminar.

            As JUSTIFICATIVAS entram no `title` porque são o que diz O QUE FAZER para destravar
            ("favor anexar a cópia atualizada do documento"), e cabem mal numa linha.
          */}
          {item.pesquisa?.situacao ? (
            <Badge
              variant={item.pesquisa.acabou ? "secondary" : "outline"}
              title={justificativasDe(item.pesquisa.resposta)}
            >
              {t.has(`situacao.${item.pesquisa.situacao}`)
                ? t(`situacao.${item.pesquisa.situacao}`)
                : item.pesquisa.situacao}
            </Badge>
          ) : null}
          {/*
            A TRAVA CONTRA PAGAR DUAS VEZES.

            A gerenciadora ACEITA pesquisa repetida e cobra as duas (usuário, 03/09). Quando a
            conferência achou uma válida, o botão fica travado e diz QUAL — vínculo, situação e até
            quando vale —, porque "desabilitado sem motivo" é o que faz alguém procurar outro
            caminho até o mesmo gasto.

            ── E EXISTE A SAÍDA, no `title` e num segundo clique ────────────────────────────────

            Refazer uma pesquisa válida é raro, mas não é proibido ("muito raro a primeira opção",
            usuário). Um bloqueio sem saída obrigaria a pedir pela tela da gerenciadora, que é
            justamente a ida e volta que esta fatia veio eliminar — e lá ninguém vê o aviso.

            ── SEM CONFERÊNCIA, O BOTÃO CONTINUA LIBERADO ──────────────────────────────────────

            Não conferir não é prova de que não existe pesquisa. Travar por ausência de resposta
            transformaria uma leitura opcional em obrigação silenciosa, e o primeiro dia em que a
            Integra ficasse fora do ar seria um dia sem conseguir pesquisar ninguém.
          */}
          {jaFoi && !item.pesquisa ? (
            decisao.podePedir ? (
              <Button variant="destructive" onClick={() => setPedindoPesquisa(true)}>
                <Search />
                {t("pedirPesquisa")}
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="max-w-md text-sm text-amber-700 dark:text-amber-400">
                  {decisao.motivo === "ja_esta_em_andamento"
                    ? t("pesquisaJaAndando", {
                        vinculo: decisao.bloqueadaPor?.vinculo ?? "",
                        codigo: decisao.bloqueadaPor?.codigo ?? 0,
                      })
                    : t("pesquisaJaExiste", {
                        vinculo: decisao.bloqueadaPor?.vinculo ?? "",
                        situacao: situacaoLegivel(decisao.bloqueadaPor?.situacao),
                        validade: decisao.bloqueadaPor?.dataExpiracao
                          ? t("conferenciaPesquisaValidade", {
                              data: dataPuraBr(decisao.bloqueadaPor.dataExpiracao),
                            })
                          : "",
                      })}
                </span>
                <Button variant="outline" size="sm" onClick={() => setPedindoPesquisa(true)}>
                  {t("pesquisaPedirMesmoAssim")}
                </Button>
              </div>
            )
          ) : null}
        </div>
      </div>

      <DialogDaPesquisa
        aberto={pedindoPesquisa}
        aoFechar={() => setPedindoPesquisa(false)}
        aoConfirmar={(escolhas) => {
          setPedindoPesquisa(false);
          pesquisar.mutate(escolhas);
        }}
        pendente={pesquisar.isPending}
      />
    </div>
  );
}

/**
 * O DIÁLOGO DA PESQUISA — a única tela do sistema que gasta dinheiro ao confirmar.
 *
 * Ele existe porque a pesquisa não é um clique: exige duas decisões que ninguém pode tomar pelo
 * usuário. O VÍNCULO (frota, agregado ou terceiro) é obrigatório no método e o formulário público
 * não o pergunta — o motorista não sabe se é frota ou agregado, quem sabe é quem contrata. E as
 * TRÊS OPÇÕES PAGAS mudam o valor cobrado.
 *
 * ── NENHUMA OPÇÃO PAGA VEM MARCADA ────────────────────────────────────────────────────────────
 *
 * O padrão é o mais barato. Marcar por conveniência seria escolher gastar mais em nome de quem não
 * escolheu — e o erro seria invisível, porque a diferença só aparece na fatura.
 *
 * ── O VÍNCULO TAMBÉM NÃO TEM PADRÃO ───────────────────────────────────────────────────────────
 *
 * "Terceiro" seria o chute cômodo. Mas o vínculo vai junto na pesquisa e é o que a gerenciadora usa
 * para classificar a pessoa: errar aqui é pesquisar sob a regra errada, e ninguém descobre olhando
 * a tela. Sem escolha, o botão não libera.
 */
function DialogDaPesquisa({
  aberto,
  aoFechar,
  aoConfirmar,
  pendente,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoConfirmar: (e: {
    vinculo: "F" | "A" | "T";
    expressa: boolean;
    pesquisaPlus: boolean;
    biometrica: boolean;
  }) => void;
  pendente: boolean;
}) {
  const t = useTranslations("PreCadastros");
  const [vinculo, setVinculo] = useState<"F" | "A" | "T" | null>(null);
  const [expressa, setExpressa] = useState(false);
  const [pesquisaPlus, setPesquisaPlus] = useState(false);
  const [biometrica, setBiometrica] = useState(false);

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("pesquisaTitulo")}</DialogTitle>
          {/* O aviso de custo é a primeira coisa que se lê, não uma nota de rodapé. */}
          <DialogDescription className="text-destructive font-medium">
            {t("pesquisaAviso")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-sm font-medium">{t("pesquisaVinculo")}</span>
            <div className="flex flex-wrap gap-1.5">
              {(["F", "A", "T"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={vinculo === v}
                  onClick={() => setVinculo(v)}
                  className={cn(
                    "rounded border px-3 py-1 text-sm transition-colors",
                    vinculo === v
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-muted",
                  )}
                >
                  {t(`pesquisaVinculo${v}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">{t("pesquisaOpcoes")}</span>
            {(
              [
                ["expressa", expressa, setExpressa],
                ["pesquisaPlus", pesquisaPlus, setPesquisaPlus],
                ["biometrica", biometrica, setBiometrica],
              ] as const
            ).map(([chave, valor, set]) => (
              <label key={chave} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={valor}
                  onChange={(e) => set(e.target.checked)}
                  className="mt-0.5"
                />
                <span>{t(`pesquisaOpcao_${chave}`)}</span>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={aoFechar}>
            {t("cancelar")}
          </Button>
          {/* Sem vínculo o botão não libera — ver o cabeçalho: não há chute cômodo aqui. */}
          <Button
            variant="destructive"
            disabled={!vinculo || pendente}
            onClick={() => vinculo && aoConfirmar({ vinculo, expressa, pesquisaPlus, biometrica })}
          >
            {t("pesquisaConfirmar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
