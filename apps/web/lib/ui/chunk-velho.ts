/**
 * O CHUNK VELHO — o erro que todo deploy produz, e o conserto dele (2026-08-31).
 *
 * O Next dá nome aos arquivos JS com um hash do conteúdo. Quando um deploy entra, os nomes mudam, e
 * quem estava com a página aberta continua apontando para os antigos. No clique seguinte o navegador
 * pede um arquivo que não existe mais e a aplicação morre com `ChunkLoadError`.
 *
 * A pessoa vê "Application error: a client-side exception has occurred", que não diz nada e parece o
 * sistema quebrado. Aconteceu de verdade em 31/08.
 *
 * Este arquivo existe separado dos dois boundaries (`error.tsx` e `global-error.tsx`) porque os dois
 * precisam da MESMA decisão. Duas cópias divergiriam em silêncio, e a divergência apareceria só no
 * dia em que uma delas entrasse em laço.
 */

const MARCA = "tms-recarregou-por-chunk";

/**
 * É chunk velho, ou defeito de verdade?
 *
 * As quatro formas que o erro assume entre navegadores e versões do Next. Reconhecer errado nos dois
 * sentidos custa caro: deixar passar mantém a tela morta; incluir demais recarrega um defeito real.
 */
export function ehChunkVelho(erro: { name?: string; message?: string }): boolean {
  const texto = `${erro?.name ?? ""} ${erro?.message ?? ""}`;
  return (
    /ChunkLoadError/i.test(texto) ||
    /Loading chunk [\w-]+ failed/i.test(texto) ||
    /Failed to fetch dynamically imported module/i.test(texto) ||
    /error loading dynamically imported module/i.test(texto)
  );
}

/**
 * Deve recarregar agora? Marca a tentativa e devolve `true` UMA VEZ por sessão.
 *
 * ── POR QUE NO MÁXIMO UMA ─────────────────────────────────────────────────────────────────────
 *
 * Um erro recarregado em laço apaga o rastro que alguém usaria para achar o defeito, e deixa a
 * pessoa diante de uma tela piscando. Se quebrou de novo logo depois de uma recarga, o problema NÃO
 * era o chunk — e insistir esconderia isso.
 *
 * Foi exatamente o caso de 31/08: o servidor devolvia 404 num arquivo que existia no disco. Nenhuma
 * recarga resolveria, e um laço infinito teria escondido a causa por horas.
 *
 * ── SEM `sessionStorage`, NÃO RECARREGA ───────────────────────────────────────────────────────
 *
 * Janela anônima, cookies bloqueados, navegador antigo: sem onde marcar, não há como garantir "uma
 * vez só". Recarregar às cegas arrisca o laço, então o desfecho seguro é a tela com o botão — a
 * pessoa recarrega com um clique, sabendo o que está fazendo.
 */
export function deveRecarregar(erro: { name?: string; message?: string }): boolean {
  if (!ehChunkVelho(erro)) return false;
  try {
    if (sessionStorage.getItem(MARCA)) return false;
    sessionStorage.setItem(MARCA, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Limpa a marca depois que a página se manteve de pé.
 *
 * Sem isto, a primeira recarga bem-sucedida deixaria a marca para sempre, e o SEGUNDO deploy do dia
 * não seria consertado sozinho.
 */
export function esquecerRecarga(): void {
  try {
    sessionStorage.removeItem(MARCA);
  } catch {
    /* sem sessionStorage não há marca a limpar */
  }
}
