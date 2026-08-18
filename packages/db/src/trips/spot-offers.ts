import { desc, sql } from "drizzle-orm";
import type { SpotOfferInput } from "@brazil-tms/shared";
import { db } from "../client";
import { spotOffers } from "../../schema";

/**
 * A oferta de spot, gravada e lida (2026-08-18). Ver `schema/spot-offers.ts` para o porquê da tabela
 * separada e de os campos serem texto.
 */

export interface SpotOfferView {
  id: string;
  portalTripId: string;
  tripNumber: string | null;
  route: string;
  vehicle: string | null;
  price: string | null;
  departure: string | null;
  arrival: string | null;
  operator: string | null;
  receivedAt: string;
}

/**
 * Grava a oferta, ou não faz nada se ela já é conhecida.
 *
 * `DO NOTHING` e não `DO UPDATE`: reenvio é sinal de que o monitor reiniciou e está recontando o que
 * ainda está em leilão, não de que a oferta mudou. Atualizar o `received_at` faria uma oferta de
 * ontem voltar a ser "recente" e reaparecer na TV.
 *
 * Devolve se era nova — é o que o monitor loga do lado dele.
 */
export async function recordSpotOffer(offer: SpotOfferInput): Promise<{ nova: boolean }> {
  const inserted = await db
    .insert(spotOffers)
    .values({
      portalTripId: offer.portalTripId,
      tripNumber: offer.tripNumber ?? null,
      route: offer.route,
      vehicle: offer.vehicle ?? null,
      price: offer.price ?? null,
      departure: offer.departure ?? null,
      arrival: offer.arrival ?? null,
      operator: offer.operator ?? null,
      createdAtPortal: offer.createdAtPortal ?? null,
    })
    .onConflictDoNothing({ target: spotOffers.portalTripId })
    .returning({ id: spotOffers.id });
  return { nova: inserted.length > 0 };
}

/**
 * Quantos minutos de ofertas a TV recebe em cada consulta.
 *
 * Dez, e não trinta segundos (o intervalo da tela), porque a TV recarrega sozinha quando a rede
 * volta: uma janela do tamanho do intervalo perderia a oferta que chegou durante a queda. Quem
 * decide o que ANUNCIAR é a tela, que lembra o que já mostrou — a janela larga só garante que a
 * oferta esteja na resposta para ser considerada.
 */
export const OFERTAS_JANELA_MIN = 10;

export async function readRecentSpotOffers(janelaMin = OFERTAS_JANELA_MIN): Promise<SpotOfferView[]> {
  const rows = await db
    .select()
    .from(spotOffers)
    .where(sql`${spotOffers.receivedAt} > now() - ${`${janelaMin} minutes`}::interval`)
    .orderBy(desc(spotOffers.receivedAt))
    .limit(20);
  return rows.map((r) => ({
    id: r.id,
    portalTripId: r.portalTripId,
    tripNumber: r.tripNumber,
    route: r.route,
    vehicle: r.vehicle,
    price: r.price,
    departure: r.departure,
    arrival: r.arrival,
    operator: r.operator,
    receivedAt: r.receivedAt.toISOString(),
  }));
}
