"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, FileImage, Save, Send } from "lucide-react";
import {
  formatDateTime,
  motivosDeNaoCadastrar,
  type CampoDoCadastro,
  type CamposDoPreCadastro,
} from "@brazil-tms/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { avisar } from "@/lib/ui/avisos";

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
      base[chave] = limpo === "" ? { valor: null, origem: null } : { valor: limpo, origem: "digitado" };
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
                          onChange={(e) =>
                            setRascunho((r) => ({ ...r, [campo]: e.target.value }))
                          }
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
        </div>
      </div>
    </div>
  );
}
