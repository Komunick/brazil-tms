import { normalizarPlaca } from "@brazil-tms/shared";

/**
 * ONDE CAI A PLACA QUE A PESSOA CLICOU na tira de sugestões.
 *
 * ── O DEFEITO QUE ISTO CONSERTA (31/08, relatado) ──────────────────────────────────────────────
 *
 * A regra anterior era "preenche o primeiro campo VAZIO, e se não houver nenhum, não faz nada". Num
 * truck existe UM campo: o primeiro clique preenchia, e todos os cliques seguintes eram engolidos em
 * silêncio. Quem estava olhando via a placa "grudada" e só conseguia trocar digitando por cima — que
 * é exatamente o caminho que a tira de sugestões existe para evitar.
 *
 * O silêncio era o pior da história: o botão respondia ao clique com a aparência de sempre e não
 * acontecia nada, então não parecia defeito, parecia que a tela tinha travado.
 *
 * ── A REGRA, EM TRÊS LINHAS ────────────────────────────────────────────────────────────────────
 *
 *   1. A placa JÁ ESTÁ num campo  → não mexe em nada.
 *   2. Existe campo vazio         → preenche o PRIMEIRO vazio.
 *   3. Está tudo cheio            → SUBSTITUI o primeiro campo.
 *
 * O caso 1 vem antes de propósito. Ele é o que impede o par duplicado — o portal recusa a ordem
 * inteira quando as duas placas são iguais — e também o que impede o clique acidental de apagar o
 * que já está escolhido: repetir o clique numa placa já selecionada não faz nada, em vez de tirá-la.
 *
 * O caso 3 é o conserto, e ele escolhe o PRIMEIRO campo porque é o campo que a operação chama de
 * "placa do veículo" e é o único que vai ao portal (ver `enfileirarOrdemDoPortal`). Numa carreta,
 * com os dois campos cheios, ele troca o cavalo e não o reboque — e essa é a parte que continua
 * sendo um palpite: não há como saber qual dos dois a pessoa quis trocar. É um palpite VISÍVEL,
 * porém, e desfazível com outro clique, enquanto não fazer nada não se explica nem se desfaz.
 */
export function aplicarPlacaSugerida(
  atual: readonly string[],
  nova: string,
): { placas: string[]; substituiu: number | null } {
  const placa = normalizarPlaca(nova);
  const placas = atual.map(normalizarPlaca);

  if (placa === "" || placas.includes(placa)) return { placas: [...atual], substituiu: null };

  const vazio = placas.indexOf("");
  if (vazio >= 0) {
    return { placas: placas.map((p, i) => (i === vazio ? placa : p)), substituiu: null };
  }

  /**
   * Sem campo nenhum não há onde pôr — e isso não é hipótese de laboratório: o botão "remover
   * placa" pode esvaziar a lista, e um `[0]` cego criaria um campo do nada.
   */
  if (placas.length === 0) return { placas: [], substituiu: null };

  return { placas: placas.map((p, i) => (i === 0 ? placa : p)), substituiu: 0 };
}
