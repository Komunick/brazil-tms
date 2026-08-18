/**
 * O menu lateral lembra se está recolhido — e lembra em COOKIE, não em localStorage (2026-08-18).
 *
 * A diferença não é preferência de arquitetura: o `localStorage` só existe depois que o JavaScript
 * roda, então o servidor sempre desenharia o menu aberto e o navegador o fecharia logo depois. Isso
 * é um pulo visível a cada carga — e esta tela vive numa TV que se recarrega sozinha quando a rede
 * volta (`useReconexao`), de modo que o pulo apareceria o dia inteiro.
 *
 * Com cookie, o servidor já desenha do jeito certo na primeira pintura.
 */
export const COOKIE_MENU = "menu-recolhido";

/** Um ano: é uma preferência de quem senta na máquina, não uma sessão. */
const UM_ANO = 60 * 60 * 24 * 365;

export function gravarMenuRecolhido(recolhido: boolean): void {
  document.cookie = `${COOKIE_MENU}=${recolhido ? "1" : "0"}; path=/; max-age=${UM_ANO}; samesite=lax`;
}
