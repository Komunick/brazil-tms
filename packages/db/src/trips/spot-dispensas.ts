import { db } from "../client";
import { spotOfferDispensas } from "../../schema";

/**
 * IGNORAR UMA OFERTA — só para quem clicou (2026-09-01).
 *
 * Ver `schema/spot-offers.ts` para o porquê da tabela. Aqui há uma escrita e nada mais.
 *
 * ── NÃO EXISTE O INVERSO, E É DECISÃO ─────────────────────────────────────────────────────────
 *
 * Não há função de "des-dispensar", e não é esquecimento: o caminho de volta é o Painel do dia, onde
 * a linha continua listada, assinalada como ignorada, e ainda aceitável. Uma segunda porta para a
 * oferta voltar à tela seria um segundo jeito de o cartão aparecer, e ninguém pediu isso.
 *
 * ── E NÃO EXISTE `DELETE` ─────────────────────────────────────────────────────────────────────
 *
 * Princípio III: descartar arquiva, não apaga. Dispensar GRAVA uma linha dizendo que aquela pessoa
 * tirou aquela oferta da própria tela — é registro, não remoção. A oferta continua inteira na
 * tabela dela, continua na tela dos colegas e continua no registro do dia.
 */

/**
 * Grava a dispensa. Idempotente por construção: a chave primária é `(oferta, pessoa)`, então
 * dispensar duas vezes é a mesma dispensa e dois cliques simultâneos não se atropelam.
 */
export async function dispensarOferta(spotOfferId: string, userId: string): Promise<void> {
  await db.insert(spotOfferDispensas).values({ spotOfferId, userId }).onConflictDoNothing();
}
