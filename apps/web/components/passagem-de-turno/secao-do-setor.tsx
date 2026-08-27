"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import type { Campo, Secao } from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  secao,
  itens,
  editavel,
  aoSalvar,
  aoRemover,
}: {
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

function LinhaDaTabela({
  secao,
  dados,
  editavel,
  novo,
  aoSalvar,
  aoRemover,
}: {
  secao: Secao;
  dados: Record<string, string>;
  editavel: boolean;
  novo?: boolean;
  aoSalvar: (dados: Record<string, string>) => void;
  aoRemover: () => void;
}) {
  const t = useTranslations("PassagemTurno");
  const [rascunho, setRascunho] = useState(dados);
  const mudar = (chave: string, valor: string) => setRascunho((r) => ({ ...r, [chave]: valor }));
  const gravar = () => {
    if (mudou(rascunho, dados) && temConteudo(rascunho)) aoSalvar(rascunho);
  };

  return (
    <tr className={cn(novo && "bg-accent/30")}>
      {secao.campos.map((campo) => (
        <td key={campo.chave} className="px-2 py-1">
          <CampoEditavel
            campo={campo}
            valor={rascunho[campo.chave] ?? ""}
            editavel={editavel}
            compacto
            aoMudar={(v) => mudar(campo.chave, v)}
            aoSair={gravar}
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
  secao,
  dados,
  editavel,
  novo,
  aoSalvar,
  aoRemover,
}: {
  secao: Secao;
  dados: Record<string, string>;
  editavel: boolean;
  novo?: boolean;
  aoSalvar: (dados: Record<string, string>) => void;
  aoRemover: () => void;
}) {
  const t = useTranslations("PassagemTurno");
  const [rascunho, setRascunho] = useState(dados);
  const mudar = (chave: string, valor: string) => setRascunho((r) => ({ ...r, [chave]: valor }));
  const gravar = () => {
    if (mudou(rascunho, dados) && temConteudo(rascunho)) aoSalvar(rascunho);
  };

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
                aoMudar={(v) => mudar(campo.chave, v)}
                aoSair={gravar}
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
            aoSair={gravar}
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
  aoMudar,
  aoSair,
}: {
  campo: Campo;
  valor: string;
  editavel: boolean;
  compacto?: boolean;
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
      className="h-7 text-sm"
      aria-label={campo.rotulo}
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
