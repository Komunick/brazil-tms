import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * A OFERTA DE SPOT que o cliente abriu em leilão (2026-08-18).
 *
 * Não é uma viagem — é um convite para dar lance, e some sozinho quando o leilão fecha. Por isso não
 * mora em `trips`: nada aqui tem status, motorista, marco ou faturamento, e tratar as duas coisas na
 * mesma tabela criaria viagens fantasma que nunca aconteceram.
 *
 * QUEM DETECTA NÃO É O TMS. Existe um monitor rodando numa VM Windows, na aba "During Spot Bidding"
 * do portal, que já faz a parte difícil: captura a consulta do próprio portal (em vez de montar uma,
 * que quebraria quando a Shopee mudasse parâmetro), filtra `bid_status = 10` (validado em produção,
 * 58 de 58) e compara a rota contra a lista de rotas de interesse. Ele avisa no Telegram desde então.
 *
 * Este endpoint é o SEGUNDO destino do mesmo aviso: o que já vai para o celular passa a aparecer
 * também no painel de parede. A detecção não foi reimplementada de propósito — reimplementá-la seria
 * criar uma segunda regra de "o que é oferta", com chance de divergir da que já está validada.
 *
 * OS CAMPOS SÃO TEXTO COMO O MONITOR JÁ FORMATA. Parece preguiça e é decisão: o TMS não calcula nada
 * com estes valores, só mostra na tela. Reprocessar data e dinheiro aqui abriria uma segunda chance
 * de errar fuso e centavo — e o número que a sala precisa ler é exatamente o que já foi conferido no
 * Telegram.
 */
export const spotOffers = pgTable(
  "spot_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** O id da viagem no portal. É a chave de "já vi esta oferta" dos dois lados. */
    portalTripId: text("portal_trip_id").notNull(),
    tripNumber: text("trip_number"),
    /** "ORIGEM  ->  DESTINO", como o monitor monta a partir das estações do portal. */
    route: text("route").notNull(),
    vehicle: text("vehicle"),
    /** Já formatado ("R$ 4.548,30") ou a frase que o monitor usa quando o portal não exibe preço. */
    price: text("price"),
    departure: text("departure"),
    arrival: text("arrival"),
    operator: text("operator"),
    createdAtPortal: text("created_at_portal"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // O monitor reenvia a mesma oferta se for reiniciado (a memória dele é por navegador). Sem esta
    // chave, um reinício na madrugada encheria a TV de avisos de ofertas velhas.
    uniqueIndex("spot_offers_portal_trip_uq").on(table.portalTripId),
    index("spot_offers_received_idx").on(table.receivedAt.desc()),
  ],
);
