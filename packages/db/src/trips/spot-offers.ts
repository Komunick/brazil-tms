import { and, desc, gte, lt } from "drizzle-orm";
import { dayRangeSaoPaulo, type SpotOfferInput } from "@brazil-tms/shared";
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
  originArrival: string | null;
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
      originArrival: offer.originArrival ?? null,
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
 * A LISTA DO DIA, e não uma janela de minutos (2026-08-18).
 *
 * Nasceu como "os últimos dez minutos", que era o suficiente quando o único destino era o aviso de
 * trinta segundos. Com o cartãozinho de histórico no painel, a pergunta virou outra: "o que passou
 * hoje?" — e uma janela de minutos apagaria a oferta das 8h antes do café.
 *
 * Uma lista só serve aos dois: o aviso decide o que anunciar pela MEMÓRIA da tela (ver
 * `novasOfertas`), não pelo tamanho da janela. Duas consultas com recortes diferentes seriam duas
 * verdades sobre a mesma coisa.
 */
export async function readSpotOffersToday(agora = new Date()): Promise<SpotOfferView[]> {
  const { from, to } = dayRangeSaoPaulo(agora);
  const rows = await db
    .select()
    .from(spotOffers)
    .where(and(gte(spotOffers.receivedAt, new Date(from)), lt(spotOffers.receivedAt, new Date(to))))
    .orderBy(desc(spotOffers.receivedAt))
    // Teto de sanidade: num dia de pico o leilão abre dezenas, e a tela mostra as primeiras.
    .limit(30);
  return rows.map(paraView);
}

function paraView(r: typeof spotOffers.$inferSelect): SpotOfferView {
  return {
    id: r.id,
    portalTripId: r.portalTripId,
    tripNumber: r.tripNumber,
    route: r.route,
    vehicle: r.vehicle,
    price: r.price,
    originArrival: r.originArrival,
    departure: r.departure,
    arrival: r.arrival,
    operator: r.operator,
    receivedAt: r.receivedAt.toISOString(),
  };
}
