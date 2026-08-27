"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import type { Campo, Secao, Setor } from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSugestao } from "./use-sugestao";

export interface ItemNaTela {
  id: string;
  secao: string;
  ordem: number;
  dados: Record<string, string>;
}

/**
 * UMA SEÇÃO DA FAIXA — em tabela ou em cartões (2026-08-26).
 *
 * ── AS DUAS FORMAS VIERAM DA PLANILHA, NÃO DE GOSTO ───────────────────────────────────────────
 *
 * `tabela` para o que é curto (LH, origem, destino); `cartao` para o que carrega OCORRÊNCIA, que é
 * texto longo. Uma ocorrência real do Monitoring de 25/08 tem 90 caracteres: numa linha de tabela
 * isso ou estoura a largura ou vira reticências, e reticências num relato de turno é o mesmo que
 * não ter escrito.
 *
 * É a mesma razão que levou o comentário da LH a virar popup na 029 em vez de coluna.
 *
 * ── GRAVA AO SAIR DO CAMPO ────────────────────────────────────────────────────────────────────
 *
 * Não há botão "salvar" por item, e é deliberado: quem preenche um diário de turno está com o
 * telefone no ombro. Um botão a mais por linha é um item que fica sem gravar porque alguém foi
 * atender a porta — e o registro perdido só aparece no turno seguinte, quando não dá mais para
 * lembrar.
 */
export function SecaoDoSetor({
  setor,
  secao,
  itens,
  editavel,
  aoSalvar,
  aoRemover,
}: {
  setor: Setor;
  secao: Secao;
  itens: ItemNaTela[];
  editavel: boolean;
  aoSalvar: (item: { itemId: string | null; secao: string; dados: Record<string, string> }) => void;
  aoRemover: (itemId: string) => void;
}) {
  /**
   * A LINHA EM BRANCO É LOCAL, e só existe depois de alguém pedir.
   *
   * Uma linha vazia sempre presente no fim da tabela é o padrão de planilha, e aqui seria erro: a
   * conferência recusa item vazio, então a linha fantasma produziria um aviso a cada gravação de
   * qualquer outra coisa. Melhor um botão que diz o que faz.
   */
  const t = useTranslations("PassagemTurno");
  const [novos, setNovos] = useState<Record<string, string>[]>([]);

  const adicionar = () => setNovos((n) => [...n, {}]);
  const descartarNovo = (i: number) => setNovos((n) => n.filter((_, k) => k !== i));

  const salvarNovo = (i: number, dados: Record<string, string>) => {
    if (!temConteudo(dados)) return;
    aoSalvar({ itemId: null, secao: secao.chave, dados });
    descartarNovo(i);
  };

  const vazia = itens.length === 0 && novos.length === 0;

  return (
    <section className="space-y-2" aria-label={secao.titulo}>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{secao.titulo}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {itens.length > 0 ? itens.length : ""}
        </span>
        {editavel ? (
          <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1" onClick={adicionar}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t("adicionar")}
          </Button>
        ) : null}
      </div>

      {vazia ? (
        // "Nada registrado" e não um vazio mudo: num diário de turno, a ausência é uma afirmação —
        // "não houve" — e ela precisa ser legível para quem lê no turno seguinte.
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          {t("nadaRegistrado")}
        </p>
      ) : secao.forma === "tabela" ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {secao.campos.map((c) => (
                  <th key={c.chave} className="px-2 py-1.5 text-left text-xs font-medium">
                    {c.rotulo}
                  </th>
                ))}
                {editavel ? <th className="w-8" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {itens.map((item) => (
                <LinhaDaTabela
                  key={item.id}
                  setor={setor}
                  secao={secao}
                  dados={item.dados}
                  editavel={editavel}
                  aoSalvar={(dados) => aoSalvar({ itemId: item.id, secao: secao.chave, dados })}
                  aoRemover={() => aoRemover(item.id)}
                />
              ))}
              {novos.map((dados, i) => (
                <LinhaDaTabela
                  key={`novo-${i}`}
                  setor={setor}
                  secao={secao}
                  dados={dados}
                  editavel
                  novo
                  aoSalvar={(d) => salvarNovo(i, d)}
                  aoRemover={() => descartarNovo(i)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {itens.map((item) => (
            <Cartao
              key={item.id}
              setor={setor}
              secao={secao}
              dados={item.dados}
              editavel={editavel}
              aoSalvar={(dados) => aoSalvar({ itemId: item.id, secao: secao.chave, dados })}
              aoRemover={() => aoRemover(item.id)}
            />
          ))}
          {novos.map((dados, i) => (
            <Cartao
              key={`novo-${i}`}
              setor={setor}
              secao={secao}
              dados={dados}
              editavel
              novo
              aoSalvar={(d) => salvarNovo(i, d)}
              aoRemover={() => descartarNovo(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * O RASCUNHO DE UM ITEM — estado, gravação e preenchimento automático (2026-08-27).
 *
 * Um hook porque a linha de tabela e o cartão fazem exatamente a mesma coisa e sempre fizeram: o
 * rascunho e a gravação já viviam duplicados nos dois. Ao acrescentar o preenchimento automático a
 * duplicação passaria de três linhas para trinta — e o dia em que uma das cópias fosse corrigida
 * produziria uma tela onde a tabela preenche e o cartão não, sem que nada acusasse.
 */
function useRascunho(args: {
  setor: Setor;
  secao: Secao;
  dados: Record<string, string>;
  aoSalvar: (dados: Record<string, string>) => void;
}) {
  const { setor, secao, dados, aoSalvar } = args;
  const [rascunho, setRascunho] = useState(dados);
  const [preenchidos, setPreenchidos] = useState<string[]>([]);
  const [naoAchou, setNaoAchou] = useState(false);
  const { buscar, buscando } = useSugestao(setor, secao.chave);

  const temCampo = (chave: string) => secao.campos.some((c) => c.chave === chave);
  /**
   * QUAIS CAMPOS DISPARAM A BUSCA.
   *
   * A LH, onde ela existe. E o nome do motorista SÓ onde a seção tem telefone — ou seja, na lista
   * de disponíveis. Nas outras, buscar o motorista gastaria uma requisição para descobrir um
   * telefone que a seção não desenha.
   */
  const gatilho = (chave: string): "lh" | "motorista" | null => {
    if (chave === "lh" && temCampo("lh")) return "lh";
    if (chave === "motorista" && temCampo("telefone")) return "motorista";
    return null;
  };

  const mudar = (chave: string, valor: string) => {
    setRascunho((r) => ({ ...r, [chave]: valor }));
    // Digitar de novo apaga o aviso e o destaque: eles descrevem a busca ANTERIOR.
    setPreenchidos([]);
    setNaoAchou(false);
  };

  const aoSair = async (chave: string) => {
    let atual = rascunho;

    const tipo = gatilho(chave);
    if (tipo) {
      const r = await buscar(tipo, rascunho[chave] ?? "", rascunho);
      if (r) {
        atual = r.dados;
        setRascunho(r.dados);
        setPreenchidos(r.preenchidos);
        setNaoAchou(r.naoAchou);
      }
    }

    // Grava o resultado da MESCLA, não o estado — `setRascunho` é assíncrono e o item sairia sem o
    // que a busca acabou de preencher.
    if (mudou(atual, dados) && temConteudo(atual)) aoSalvar(atual);
  };

  return { rascunho, mudar, aoSair, preenchidos, naoAchou, buscando };
}

function LinhaDaTabela({
  setor,
  secao,
  dados,
  editavel,
  novo,
  aoSalvar,
  aoRemover,
}: {
  setor: Setor;
  secao: Secao;
  dados: Record<string, string>;
  editavel: boolean;
  novo?: boolean;
  aoSalvar: (dados: Record<string, string>) => void;
  aoRemover: () => void;
}) {
  const t = useTranslations("PassagemTurno");
  const { rascunho, mudar, aoSair, preenchidos, naoAchou, buscando } = useRascunho({
    setor,
    secao,
    dados,
    aoSalvar,
  });

  return (
    <tr className={cn(novo && "bg-accent/30")}>
      {secao.campos.map((campo) => (
        <td key={campo.chave} className="px-2 py-1">
          <CampoEditavel
            campo={campo}
            valor={rascunho[campo.chave] ?? ""}
            editavel={editavel}
            compacto
            destacado={preenchidos.includes(campo.chave)}
            aviso={campo.chave === "lh" && naoAchou ? t("lhNaoEncontrada") : undefined}
            ocupado={campo.chave === "lh" && buscando}
            aoMudar={(v) => mudar(campo.chave, v)}
            aoSair={() => void aoSair(campo.chave)}
          />
        </td>
      ))}
      {editavel ? (
        <td className="px-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={aoRemover}
            aria-label={novo ? t("descartar") : t("remover")}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </td>
      ) : null}
    </tr>
  );
}

/**
 * O CARTÃO: campos curtos empilhados à esquerda, a ocorrência ocupando a altura toda à direita.
 *
 * É o desenho da planilha, e ele existe pela razão certa — a ocorrência é o conteúdo, e os outros
 * campos são a etiqueta que diz de qual viagem se está falando.
 */
function Cartao({
  setor,
  secao,
  dados,
  editavel,
  novo,
  aoSalvar,
  aoRemover,
}: {
  setor: Setor;
  secao: Secao;
  dados: Record<string, string>;
  editavel: boolean;
  novo?: boolean;
  aoSalvar: (dados: Record<string, string>) => void;
  aoRemover: () => void;
}) {
  const t = useTranslations("PassagemTurno");
  const { rascunho, mudar, aoSair, preenchidos, naoAchou, buscando } = useRascunho({
    setor,
    secao,
    dados,
    aoSalvar,
  });

  const ocorrencia = secao.campos.find((c) => c.chave === "ocorrencia");
  const demais = secao.campos.filter((c) => c.chave !== "ocorrencia");

  return (
    <div className={cn("flex gap-3 rounded-md border p-2", novo && "bg-accent/30")}>
      <dl className="min-w-0 flex-1 space-y-1">
        {demais.map((campo) => (
          <div key={campo.chave} className="grid grid-cols-[5.5rem_1fr] items-center gap-1">
            <dt className="truncate text-xs text-muted-foreground">{campo.rotulo}</dt>
            <dd className="min-w-0">
              <CampoEditavel
                campo={campo}
                valor={rascunho[campo.chave] ?? ""}
                editavel={editavel}
                compacto
                destacado={preenchidos.includes(campo.chave)}
                aviso={campo.chave === "lh" && naoAchou ? t("lhNaoEncontrada") : undefined}
                ocupado={campo.chave === "lh" && buscando}
                aoMudar={(v) => mudar(campo.chave, v)}
                aoSair={() => void aoSair(campo.chave)}
              />
            </dd>
          </div>
        ))}
      </dl>

      {ocorrencia ? (
        <div className="min-w-0 flex-1">
          <CampoEditavel
            campo={ocorrencia}
            valor={rascunho[ocorrencia.chave] ?? ""}
            editavel={editavel}
            aoMudar={(v) => mudar(ocorrencia.chave, v)}
            aoSair={() => void aoSair(ocorrencia.chave)}
          />
        </div>
      ) : null}

      {editavel ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={aoRemover}
          aria-label={novo ? t("descartar") : t("remover")}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Um campo — o controle sai do TIPO declarado no catálogo, e não de adivinhação por nome.
 *
 * `lista` vira `<select>` com as opções que a planilha já usa. Deixá-lo como texto livre seria a
 * saída preguiçosa e destruiria o pouco de taxonomia que a operação construiu: "Sem Atribuição",
 * "sem atribuicao" e "S/ atribuição" viveriam lado a lado e nenhum agrupamento voltaria a funcionar.
 */
function CampoEditavel({
  campo,
  valor,
  editavel,
  compacto,
  destacado,
  aviso,
  ocupado,
  aoMudar,
  aoSair,
}: {
  campo: Campo;
  valor: string;
  editavel: boolean;
  compacto?: boolean;
  /**
   * O campo acabou de ser preenchido pela busca, e não pela pessoa.
   *
   * O destaque some ao primeiro toque em qualquer campo do item. Ele não existe para enfeitar: um
   * valor que aparece sozinho num campo que estava vazio precisa ser distinguível do que a pessoa
   * escreveu, senão ela não sabe o que conferir — e é justamente o preenchido pelo sistema que
   * merece um segundo olhar.
   */
  destacado?: boolean;
  /** "Essa LH não existe" — quase sempre erro de digitação, e vale dizer na hora. */
  aviso?: string;
  ocupado?: boolean;
  aoMudar: (v: string) => void;
  aoSair: () => void;
}) {
  if (!editavel) {
    if (!valor) return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <span
        className={cn("block whitespace-pre-wrap break-words", compacto ? "text-sm" : "text-sm")}
      >
        {valor}
      </span>
    );
  }

  if (campo.tipo === "lista") {
    return (
      <select
        value={valor}
        onChange={(e) => {
          aoMudar(e.target.value);
        }}
        onBlur={aoSair}
        className="h-7 w-full rounded-md border bg-background px-1.5 text-sm"
        aria-label={campo.rotulo}
      >
        <option value="">—</option>
        {campo.opcoes?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (campo.tipo === "texto_longo") {
    return (
      <Textarea
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        onBlur={aoSair}
        rows={3}
        placeholder={campo.rotulo}
        className="min-h-[4.5rem] resize-y text-sm"
        aria-label={campo.rotulo}
      />
    );
  }

  return (
    <Input
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      onBlur={aoSair}
      placeholder={campo.rotulo}
      className={cn(
        "h-7 text-sm",
        // O anel de preenchido é discreto e temporário; o de aviso fica até a pessoa corrigir.
        destacado && "ring-1 ring-primary/50",
        aviso && "ring-1 ring-destructive",
        ocupado && "opacity-70",
      )}
      /*
       * O aviso vai no `title` E no `aria-describedby` implícito do `title`, e não num texto solto
       * embaixo: o campo mora numa célula de tabela, e uma linha extra ali empurraria a tabela
       * inteira a cada LH errada — que é justamente quando a pessoa está com pressa.
       */
      title={aviso}
      aria-invalid={aviso ? true : undefined}
      aria-label={aviso ? `${campo.rotulo} — ${aviso}` : campo.rotulo}
    />
  );
}

const temConteudo = (d: Record<string, string>) => Object.values(d).some((v) => v.trim() !== "");

/**
 * Comparação por conteúdo, e não por referência.
 *
 * Sem isto, todo `blur` mandaria uma gravação — inclusive o `blur` de sair de um campo em que
 * ninguém digitou nada. Um cartão de seis campos produziria seis requisições por visita, e o
 * histórico de `atualizado_em` viraria ruído que esconde as edições de verdade.
 */
function mudou(a: Record<string, string>, b: Record<string, string>) {
  const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of chaves) if ((a[k] ?? "") !== (b[k] ?? "")) return true;
  return false;
}
