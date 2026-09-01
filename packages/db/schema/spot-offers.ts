import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

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
    /**
     * O STA da PRIMEIRA parada: a hora de o caminhão ESTAR na origem (2026-08-19).
     *
     * É o instante que decide se dá para pegar o frete — os outros dois dizem quando ele sai e
     * quando chega, e nenhum deles responde "consigo pôr um caminhão aí?".
     */
    originArrival: text("origin_arrival"),
    /** O STD da primeira parada: quando ele sai da origem. */
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

/**
 * A DISPENSA PESSOAL — "esta pessoa tirou esta oferta da própria tela" (2026-09-01).
 *
 * Não é decisão sobre o frete: não vai recusa nenhuma ao portal, a oferta continua na tela dos
 * colegas até alguém aceitar, e continua no registro do dia para todos. É decisão sobre a tela de
 * quem clicou, e sobre mais nada.
 *
 * ── POR QUE ESTA É A ÚNICA TABELA QUE A FATIA CRIOU ───────────────────────────────────────────
 *
 * O cartão distingue cinco situações, e QUATRO delas já estavam gravadas antes desta fatia existir:
 * "esperando" e "aceito" são `trips.customer_fields->>'Aceitação (portal)'`; "enviado" e "recusado"
 * são `portal_commands`. Só "quem ignorou o quê" não tinha onde morar.
 *
 * Não guardar as outras quatro NÃO é economia — é o que impede uma segunda verdade. Medido: das 19
 * ofertas dos últimos dois dias, quase todas foram aceitas DIRETO NO PORTAL, sem passar pelo TMS.
 * Uma coluna nossa de "aceita" continuaria dizendo "esperando" para sempre, e o cartão nunca sairia
 * da tela de ninguém.
 *
 * ── A CHAVE COMPOSTA É A REGRA, NÃO OTIMIZAÇÃO ────────────────────────────────────────────────
 *
 * Dispensar duas vezes é a mesma dispensa. Com a PK em `(spotOfferId, userId)`, a gravação é
 * `insert … on conflict do nothing`: idempotente, e duas abas clicando junto não se atropelam.
 *
 * Sem índice além dela, de propósito: a única leitura é "esta pessoa já dispensou esta oferta?", que
 * é o prefixo exato da chave. Um índice por `userId` sozinho seria especulação.
 *
 * ── A CASCATA PELA OFERTA É OBRIGATÓRIA; PELO AUTOR, PROIBIDA ─────────────────────────────────
 *
 * Pela oferta, para que a dispensa nunca trave a remoção dela. Pelo autor, jamais: a dispensa de
 * alguém que saiu da empresa explica por que aquela oferta não estava na tela daquela pessoa, e
 * apagá-la apagaria a explicação.
 */
export const spotOfferDispensas = pgTable(
  "spot_offer_dispensas",
  {
    spotOfferId: uuid("spot_offer_id")
      .notNull()
      .references(() => spotOffers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    dispensadaEm: timestamp("dispensada_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "spot_offer_dispensas_pk", columns: [table.spotOfferId, table.userId] }),
  ],
);
