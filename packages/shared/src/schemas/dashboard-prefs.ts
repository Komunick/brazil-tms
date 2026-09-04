import { z } from "zod";

/**
 * O PAINEL DE CADA UM (2026-08-23, a pedido).
 *
 * Quem cuida de uma frente olhava nove cartões de região para usar três. A partir daqui cada pessoa
 * esconde os cartões que não são dela, e a escolha viaja com o usuário — não com o navegador.
 *
 * ── GUARDAMOS O QUE FOI ESCONDIDO, NUNCA A LISTA DO QUE APARECE ───────────────────────────────
 *
 * É a decisão que evita a falha silenciosa deste tipo de recurso. Se o guardado fosse "a ordem/os
 * cartões visíveis", todo cartão criado depois estaria ausente da lista de quem já personalizou —
 * e ausente quer dizer INVISÍVEL, para sempre, sem erro nenhum aparecer. O painel muda toda semana;
 * seria questão de dias.
 *
 * Guardando o DESVIO, o desconhecido cai no padrão: cartão novo nasce visível para todo mundo, e o
 * cartão que sumiu do código deixa uma chave órfã aqui, que não faz mal a ninguém.
 *
 * ── POR QUE A CHAVE NÃO É VALIDADA CONTRA UM CATÁLOGO ─────────────────────────────────────────
 *
 * As frentes vêm de uma planilha do cliente (`REGION_ORDER` ordena, não fecha), então uma quarta
 * região pode aparecer sem passar por aqui. Um catálogo fechado transformaria isso em 400 numa
 * requisição que não tem culpa. Validamos FORMA — texto curto, sem controle, lista limitada —, que
 * é o que protege o banco; o resto é preferência de tela, e preferência errada não corrompe nada.
 */

/** O nome que o cartão da frente sem região usa — estação ainda não cadastrada. */
export const FRENTE_SEM_REGIAO = "__sem__";

/** A chave do cartão de uma frente. `null` = estação sem região. */
export function chaveDaFrente(region: string | null): string {
  return `frente:${region ?? FRENTE_SEM_REGIAO}`;
}

/**
 * Teto de 60 chaves: o painel inteiro tem menos de 20 cartões hoje, e o dobro disso ainda cabe.
 * Existe para que uma requisição malformada não vire uma linha de banco sem fim.
 */
const listaDeChaves = z.array(z.string().trim().min(1).max(60)).max(60);

/**
 * OS FILTROS DA MINHA PROGRAMAÇÃO que a pessoa deixou ligados (30/08, a pedido).
 *
 * Antes disto eles viviam em `useState`: sair da tela e voltar zerava tudo, e quem cuida de uma
 * frente refazia a mesma escolha dezenas de vezes por dia.
 *
 * ── O QUE FICA DE FORA, E POR QUÊ ─────────────────────────────────────────────────────────────
 *
 * A BUSCA não persiste: ninguém espera reencontrar amanhã o texto que digitou hoje, e uma tela que
 * abre já filtrada por um termo esquecido parece uma tela vazia.
 *
 * OS DIAS ESCONDIDOS também não. Eles são DATAS — "esconder 30/08" não quer dizer nada em 05/09, e
 * voltaria como um filtro que não filtra: a pessoa veria o botão de filtro aceso sobre uma lista
 * inteira, sem entender o que ele está fazendo.
 *
 * ── O MESMO PRINCÍPIO DO `hidden`: guardamos o DESVIO ─────────────────────────────────────────
 *
 * `status` é o que foi ESCONDIDO, nunca o que aparece. Um status novo no sistema nasce visível para
 * quem já personalizou, em vez de ficar invisível para sempre sem erro nenhum.
 *
 * A exceção é `frentes`, que é uma SELEÇÃO e não um esconder — vazio quer dizer "todas", que é o
 * padrão, então guardá-la também é guardar o desvio.
 */
export const programacaoPrefsSchema = z.object({
  /** Até duas, como a tela e a rota já limitam. Vazio = todas as frentes. */
  frentes: z.array(z.string().trim().max(40)).max(2).optional().default([]),
  /** Os status ESCONDIDOS. `cancelled` entra aqui por padrão — ver `PADRAO_DA_PROGRAMACAO`. */
  status: z.array(z.string().trim().max(40)).max(30).optional().default([]),
  /**
   * OS DIAS ESCONDIDOS, guardados como DESLOCAMENTO e nunca como data (31/08, a pedido).
   *
   * `-1` é ontem, `0` é hoje, `2` é depois de amanhã. Guardar `2026-08-31` cumpriria a letra do
   * pedido e falharia no dia seguinte: a data guardada sairia da janela e o dia recém-chegado
   * entraria aceso, então quem escondeu ontem e anteontem para trabalhar só com hoje teria de
   * refazer a escolha TODA MANHÃ — que é exatamente a repetição de que o pedido veio reclamar.
   *
   * O deslocamento guarda a REGRA ("não quero ver o passado"), e é ela que sobrevive à virada do
   * dia. A janela da consulta hoje vai de -2 a +7; o intervalo aceito aqui é maior de propósito,
   * para que mexer na janela não faça o Zod recusar a preferência inteira de quem já tinha uma.
   */
  dias: z.array(z.number().int().min(-60).max(60)).max(40).optional().default([]),
  /** As linhas que a pessoa ocultou estão à mostra? Sem efeito desde 04/09 — ver a tela. */
  mostrarOcultas: z.boolean().optional().default(false),
  /**
   * AS COLUNAS ESCONDIDAS (2026-09-04, a pedido).
   *
   * A linha tem quinze colunas e cabe numa tela larga; em notebook, não. Quem trabalha só com a
   * expedição não quer ver SM e CTE; quem confere documento não quer ver ETA. Antes disso a saída
   * era rolar a tabela para o lado o dia inteiro.
   *
   * Guarda as ESCONDIDAS, como o resto deste objeto: vazio quer dizer "todas à vista", que é o
   * padrão, e guardar as visíveis faria uma coluna NOVA nascer escondida para quem já tinha
   * preferência salva — o pior tipo de defeito, porque a coluna existiria e ninguém a veria.
   */
  colunas: z.array(z.string().trim().max(40)).max(30).optional().default([]),
});

export type ProgramacaoPrefs = z.infer<typeof programacaoPrefsSchema>;

/**
 * O PADRÃO DE QUEM NUNCA MEXEU: cancelada escondida.
 *
 * As canceladas passaram a chegar na consulta em 30/08 — antes elas eram excluídas no SQL e ninguém
 * as via. Trazê-las acesas encheria o quadro do dia de viagem que não vai acontecer, então elas
 * nascem escondidas e o filtro fica lá, com a contagem, para quem quiser olhar.
 *
 * É o único caso em que guardar o desvio não basta: "nunca mexeu" precisa querer dizer algo
 * diferente de "nada escondido".
 */
export const PADRAO_DA_PROGRAMACAO: ProgramacaoPrefs = {
  frentes: [],
  status: ["cancelled"],
  // Nenhum dia escondido: a janela inteira à vista é o que faz sentido para quem chega sem escolha.
  dias: [],
  mostrarOcultas: false,
  // Nenhuma escondida: a linha inteira à vista é o que faz sentido para quem chega sem escolha.
  colunas: [],
};

export const dashboardPrefsSchema = z.object({
  hidden: listaDeChaves,
  /** Os cartões encolhidos — o BSC, hoje. Ausente = nenhum, para o cliente antigo não zerar nada. */
  minimized: listaDeChaves.optional().default([]),
  /** Ausente = não mexeu nos filtros; a tela aplica `PADRAO_DA_PROGRAMACAO`. */
  programacao: programacaoPrefsSchema.optional(),
});

export type DashboardPrefs = z.infer<typeof dashboardPrefsSchema>;
