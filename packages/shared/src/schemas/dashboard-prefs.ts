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
export const dashboardPrefsSchema = z.object({
  hidden: z.array(z.string().trim().min(1).max(60)).max(60),
});

export type DashboardPrefs = z.infer<typeof dashboardPrefsSchema>;
