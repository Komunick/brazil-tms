import { eq } from "drizzle-orm";
import { db } from "../client";
import { spotOfferDispensas, spotOffers } from "../../schema";
import { writeAudit } from "../audit/write-audit";

/**
 * IGNORAR UMA OFERTA — e desde 2026-09-01 isso vale para a EQUIPE.
 *
 * ── A DECISÃO SE INVERTEU, e a inversão tem uma causa ────────────────────────────────────────
 *
 * Ontem ignorar limpava só a tela de quem clicava, escolhido justamente para que ninguém pudesse
 * esconder uma oferta dos colegas. Hoje o usuário inverteu, e o que mudou junto foi a fatia 029: com
 * os cargos editáveis existe a permissão `decidir_spot`, e "quem pode decidir" deixou de ser uma
 * pergunta sem resposta.
 *
 * Então ignorar deixou de ser um gesto sobre a própria tela e virou uma DECISÃO sobre o frete —
 * "esta a gente não pega" —, tomada por quem tem autoridade para tomá-la.
 *
 * ── O QUE ISSO OBRIGA, e por que as três coisas vêm juntas ───────────────────────────────────
 *
 * Uma pessoa passa a poder tirar uma oferta da vista de todos. Isso é o ponto, e é também o risco:
 * a partir daqui, um frete perdido pode não deixar rastro nenhum na tela. Por isso o motivo e a
 * AUDITORIA entram na mesma mudança, e não depois. Quando alguém perguntar "por que não pegamos
 * aquela?", a resposta precisa existir.
 *
 * ── E CONTINUA NÃO APAGANDO NADA (princípio III) ────────────────────────────────────────────
 *
 * Ignorar GRAVA uma linha dizendo quem decidiu, quando e por quê. A oferta continua inteira na
 * tabela dela e continua no registro do dia, no Painel — o que sai é o cartão, não o fato.
 */
export async function dispensarOferta(
  spotOfferId: string,
  userId: string,
  motivo: string | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    /*
      A PRIMEIRA DECISÃO VENCE. `do nothing` e não `do update`: se duas pessoas ignoram quase juntas,
      quem chegou primeiro é quem decidiu, e reescrever trocaria o autor de um fato já registrado.
      A chave primária por oferta é o que torna isso uma corrida com um vencedor só.
    */
    const gravadas = await tx
      .insert(spotOfferDispensas)
      .values({ spotOfferId, userId, motivo: motivo?.trim() || null })
      .onConflictDoNothing()
      .returning({ id: spotOfferDispensas.spotOfferId });

    // Já estava decidida por outra pessoa: nada a registrar, e nada a desfazer.
    if (gravadas.length === 0) return;

    const [oferta] = await tx
      .select({ tripNumber: spotOffers.tripNumber, route: spotOffers.route })
      .from(spotOffers)
      .where(eq(spotOffers.id, spotOfferId))
      .limit(1);

    /**
     * A AUDITORIA NASCE NA MESMA TRANSAÇÃO da decisão, como no aceite.
     *
     * Se ela ficasse fora, uma falha entre as duas produziria uma oferta sumida da tela de todo
     * mundo sem ninguém para responder por isso — que é exatamente o estado que esta fatia não pode
     * criar.
     *
     * `previousValue` é nulo porque não havia decisão antes: o fato é o descarte em si.
     */
    await writeAudit(tx, {
      actorUserId: userId,
      action: "spot_offer.ignorada",
      entityType: "spot_offer",
      entityId: spotOfferId,
      previousValue: null,
      newValue: {
        tripNumber: oferta?.tripNumber ?? null,
        route: oferta?.route ?? null,
        // Em branco quando ninguém escreveu — e o vazio é informação: significa que não foi dito.
        motivo: motivo?.trim() || null,
      },
    });
  });
}
