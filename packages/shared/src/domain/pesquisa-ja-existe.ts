/**
 * JÁ EXISTE PESQUISA VÁLIDA? — o guarda que impede pagar duas vezes (2026-09-03, a pedido).
 *
 * ── POR QUE ELE PRECISA EXISTIR DO NOSSO LADO ─────────────────────────────────────────────────
 *
 * A gerenciadora **não bloqueia pesquisa repetida** (informado pelo usuário em 03/09): mandar duas
 * vezes cria DUAS pesquisas, e cada uma é uma linha na fatura. Não há erro, não há aviso — a segunda
 * simplesmente nasce. Então o único lugar onde isso pode ser impedido é aqui.
 *
 * ── O VÍNCULO FAZ PARTE DA CHAVE, e é aqui que um guarda ingênuo falha ────────────────────────
 *
 * A consulta da gerenciadora só encontra a pesquisa se o vínculo bater. Medido: a pesquisa do CPF
 * 08389766469 existe sob **A** (agregado) e, perguntando como F ou T, a resposta é "não existe".
 *
 * Perguntar só pelo vínculo escolhido na hora responderia "pode mandar" exatamente no caso que se
 * quer evitar: pedir como Frota para quem já tem como Agregado. Por isso a decisão recebe as TRÊS
 * respostas, e uma pesquisa em QUALQUER vínculo conta.
 *
 * ── EXPIRADA NÃO SEGURA NADA ──────────────────────────────────────────────────────────────────
 *
 * A do exemplo vale até 2027-03-01. Depois disso, refazer é o certo — e um guarda que continuasse
 * bloqueando obrigaria alguém a contorná-lo, que é como um guarda morre.
 */

/*
  O TIPO DO VÍNCULO VEM DE `pesquisa-corpo`, e não é redefinido aqui.

  Ele já existe desde a fatia do pedido de pesquisa, e é a mesma letra (F/A/T) que a gerenciadora
  usa nos dois lados — pedir e consultar. Uma segunda definição compilaria hoje e divergiria no dia
  em que alguém acrescentasse uma letra a uma delas.
*/
import type { VinculoDaPesquisa } from "./pesquisa-corpo";

export type { VinculoDaPesquisa };

/**
 * As situações que ela devolve. Só `AD` significa "está resolvido"; as outras ou estão em
 * andamento, ou pedem ação, ou dizem que não há nada.
 */
export const SITUACAO_DA_PESQUISA: Record<string, string> = {
  SP: "sem pesquisa",
  EP: "em pesquisa",
  AP: "aguardando pesquisa",
  NA: "inconclusivo",
  AD: "adequado ao risco",
  EX: "expirado",
  AC: "a consultar",
  B: "análise biométrica",
};

export interface PesquisaEncontrada {
  vinculo: VinculoDaPesquisa;
  codigo: number;
  situacao: string;
  dataExpiracao: string | null;
}

export type MotivoDeNaoPedir = "ja_existe_valida" | "ja_esta_em_andamento";

export interface DecisaoDaPesquisa {
  podePedir: boolean;
  /** Nulo quando pode pedir. */
  motivo: MotivoDeNaoPedir | null;
  /** A pesquisa que está segurando o pedido, para a tela poder dizer QUAL e até quando. */
  bloqueadaPor: PesquisaEncontrada | null;
}

/**
 * A pesquisa ainda vale hoje?
 *
 * Sem data de expiração ela conta como válida: a gerenciadora só omite o campo quando a pesquisa
 * ainda não terminou, e nesse caso pedir outra é justamente o desperdício que se quer evitar.
 */
export function pesquisaValida(p: PesquisaEncontrada, hoje: Date): boolean {
  if (!p.dataExpiracao) return true;
  const fim = new Date(`${p.dataExpiracao}T23:59:59Z`);
  return !Number.isNaN(fim.getTime()) && fim.getTime() >= hoje.getTime();
}

/** Está sendo processada agora — pedir outra criaria duas em andamento ao mesmo tempo. */
const EM_ANDAMENTO = new Set(["EP", "AP", "AC", "B"]);

/** Já resolvida, e o resultado serve enquanto não expirar. */
const RESOLVIDA = new Set(["AD"]);

/**
 * Decide, a partir do que a gerenciadora respondeu nos TRÊS vínculos.
 *
 * `SP`, `EX` e `NA` não seguram: sem pesquisa, expirada e inconclusiva são exatamente os casos em
 * que refazer é o certo. Bloqueá-los transformaria o guarda em obstáculo, e obstáculo se contorna.
 */
export function decidirPedidoDePesquisa(
  encontradas: PesquisaEncontrada[],
  hoje = new Date(),
): DecisaoDaPesquisa {
  const vivas = encontradas.filter((p) => pesquisaValida(p, hoje));

  const andando = vivas.find((p) => EM_ANDAMENTO.has(p.situacao));
  if (andando) return { podePedir: false, motivo: "ja_esta_em_andamento", bloqueadaPor: andando };

  const resolvida = vivas.find((p) => RESOLVIDA.has(p.situacao));
  if (resolvida) return { podePedir: false, motivo: "ja_existe_valida", bloqueadaPor: resolvida };

  return { podePedir: true, motivo: null, bloqueadaPor: null };
}
