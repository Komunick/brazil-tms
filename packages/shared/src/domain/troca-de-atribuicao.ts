/**
 * ISTO É UMA TROCA DE ATRIBUIÇÃO? (2026-09-04, a pedido).
 *
 * ── POR QUE A REGRA MORA AQUI, E NÃO NOS DOIS LADOS ───────────────────────────────────────────
 *
 * Duas partes precisam da mesma resposta, e por motivos diferentes:
 *
 *   · a TELA, para decidir se mostra o campo de motivo e se trava o botão;
 *   · o BANCO, dentro da transação que trava a viagem, para RECUSAR quem mandou sem motivo.
 *
 * Se as duas responderem por conta própria, o dia em que elas divergirem produz o pior resultado
 * possível: a tela não mostra o campo, a pessoa aperta, e o servidor recusa pedindo um motivo que
 * ela não tem onde escrever. Nada no código apontaria a causa — os dois lados estariam "certos".
 *
 * São dois consumidores, abaixo da régua de três do princípio I. A justificativa é essa: não é
 * reuso por economia, é uma regra que **precisa** ser a mesma nos dois lugares.
 *
 * ── O QUE CONTA COMO TROCA, E O QUE NÃO CONTA ─────────────────────────────────────────────────
 *
 * Conta: a viagem já tem alguém escalado no portal, e o que está sendo mandado é OUTRO.
 *
 * Não conta, e as duas exclusões são deliberadas:
 *
 *   · a PRIMEIRA atribuição. É o trabalho normal, são centenas por dia, e um campo obrigatório que
 *     atrapalha o gesto comum vira "asdf" digitado por reflexo — o registro existiria e não diria
 *     nada;
 *   · reenviar o MESMO motorista. Acontece ao corrigir a placa, ou ao repetir uma ordem que o portal
 *     recusou. Cobrar motivo ali puniria exatamente quem está consertando.
 */
export function ehTrocaDeAtribuicao(entrada: {
  /** Quem o PORTAL tem escalado agora. Vazio ou nulo = ninguém, e aí não há troca. */
  motoristaAtual: string | number | null | undefined;
  /** Quem está sendo mandado agora. */
  motoristaNovo: string | number | null | undefined;
}): boolean {
  const atual = texto(entrada.motoristaAtual);
  const novo = texto(entrada.motoristaNovo);
  // Sem um dos dois lados não há comparação a fazer — e "não sei" nunca deve virar exigência.
  if (atual === "" || novo === "") return false;
  return atual !== novo;
}

/** Tamanho mínimo do motivo. Três letras não fazem um motivo bom, mas barram o Enter vazio. */
export const MINIMO_DO_MOTIVO = 3;

/** O motivo escrito serve? Só faz sentido perguntar quando `ehTrocaDeAtribuicao` disse que sim. */
export function motivoDaTrocaServe(motivo: string | null | undefined): boolean {
  return (motivo ?? "").trim().length >= MINIMO_DO_MOTIVO;
}

/**
 * Os dois lados comparam TEXTO, e não número.
 *
 * O portal manda o id do motorista dentro de um campo de texto (`customer_fields`), e a tela o
 * guarda como o valor de um `<select>`, que também é texto. O banco, por sua vez, recebe um número.
 * Comparar sem normalizar faria `9900001` e `"9900001"` parecerem pessoas diferentes — e a tela
 * pediria motivo para uma troca que não existe.
 */
function texto(v: string | number | null | undefined): string {
  return v == null ? "" : String(v).trim();
}
