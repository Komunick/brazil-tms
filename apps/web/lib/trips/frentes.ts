/**
 * O TETO DE DUAS FRENTES — e o que acontece no terceiro clique (2026-08-26, a pedido).
 *
 * A Minha Programação filtrava por UMA frente de cada vez. Passou a aceitar duas, porque é assim
 * que a operação se divide: quem cuida do Sudeste e do Sul-Centro-Oeste não quer o Norte-Nordeste
 * no meio. São três frentes cadastradas (`REGION_ORDER`), então duas é "tudo menos uma".
 *
 * ── O TERCEIRO CLIQUE TROCA A MAIS ANTIGA, e não é recusado ───────────────────────────────────
 *
 * Um teto que simplesmente ignora o clique dá um botão que não faz nada. Quem clica não conclui
 * "existe um limite de duas" — conclui que a tela travou, e o passo seguinte é recarregar a página.
 * Trocando, o gesto sempre responde, e as duas escolhidas ficam à vista o tempo inteiro.
 *
 * ── POR QUE ISTO É UM ARQUIVO, E NÃO TRÊS LINHAS DENTRO DO COMPONENTE ─────────────────────────
 *
 * É a única regra desta tela que tem estado e uma alternativa errada plausível. Dentro do
 * componente ela só se prova clicando; aqui se prova por teste — que é o que impede alguém de
 * "simplificar" o terceiro clique para um `return atual` e não descobrir por semanas.
 *
 * Lista vazia é TODAS as frentes, e não nenhuma: quem não escolheu quer ver tudo.
 */
export function proximasFrentes(atual: readonly string[], valor: string): string[] {
  if (valor === "") return [];
  if (atual.includes(valor)) return atual.filter((f) => f !== valor);
  return atual.length < 2 ? [...atual, valor] : [atual[1]!, valor];
}
