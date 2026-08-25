/**
 * O QUE VOCÊ JÁ VIU — em cookie, e não em `localStorage` (2026-08-25).
 *
 * A razão é a mesma do menu recolhido (`menu-recolhido.ts`): o `localStorage` só existe depois que o
 * JavaScript roda. O servidor desenharia TODAS as entradas como novas, e o navegador apagaria os
 * selos meio segundo depois — um pisca-pisca a cada carga, justamente nos selos que a página existe
 * para mostrar. Com cookie, o servidor já desenha certo na primeira pintura.
 *
 * O valor guardado é a DATA da entrada mais recente que a pessoa viu, não a data da visita. As duas
 * quase sempre coincidem, mas não quando uma entrada é acrescentada com data retroativa: guardando a
 * data da visita, essa entrada nasceria já lida por quem passou por ali ontem.
 */

export const COOKIE_NOVIDADES = "novidades-vistas";

/** Um ano: quem não abre a página há mais de um ano merece ver tudo como novo mesmo. */
const UM_ANO = 60 * 60 * 24 * 365;

/**
 * O que conta como novo para quem NUNCA abriu a página.
 *
 * Marcar tudo seria uma parede de selos que não distingue nada. Vazio seria pior: a pessoa abriria a
 * novidade recém-anunciada sem nenhum destaque. O corte fica na entrada mais recente — quem chega
 * pela primeira vez vê em destaque o que acabou de mudar, e o resto como histórico.
 */
export function ehNova(dataDaEntrada: string, ultimaVista: string | undefined, maisRecente: string): boolean {
  if (!ultimaVista) return dataDaEntrada === maisRecente;
  return dataDaEntrada > ultimaVista;
}

export function gravarNovidadesVistas(data: string): void {
  document.cookie = `${COOKIE_NOVIDADES}=${data}; path=/; max-age=${UM_ANO}; samesite=lax`;
}
