import {
  integer,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * O QUE A SHOPEE EMPURRA, GRAVADO CRU (2026-08-20).
 *
 * Terceira fonte de viagem e a primeira que não é raspagem: o Agency Router da SPX chama uma rota
 * nossa a cada evento do motorista — chegada, carregamento, lacre, saída, descarga, conclusão. O
 * documento "4PL access to SPX" descreve o formato; esta tabela guarda o que chegou, antes de
 * qualquer interpretação.
 *
 * ── POR QUE CRU, E POR QUE UMA TABELA SÓ PARA ISSO ─────────────────────────────────────────────
 *
 * Nunca recebemos um payload real. O que existe é uma impressão de página interna, de abril de
 * 2025, com exemplos de viagem de teste. Escrever o mapeamento para `trips` agora seria codificar
 * um palpite: o documento não diz se o push vem por estação ou só no início e no fim, e a lista de
 * campos veio de uma tabela impressa, não de um contrato.
 *
 * Então a primeira versão não interpreta. Ela recebe, confere a assinatura, guarda o JSON inteiro e
 * responde `retcode 0`. Quando o primeiro lote real chegar, o mapeamento se escreve olhando dado de
 * verdade — e o histórico já estará aqui, inclusive o dos dias em que ainda não sabíamos ler.
 *
 * É a mesma escolha do robô do portal, que entrega payload cru pelo mesmo motivo: numa integração
 * de terceiro, o custo de guardar o original é ínfimo perto do custo de descobrir tarde que se
 * jogou fora o campo que explicava tudo.
 *
 * ── `trace_id` É A CHAVE DE IDEMPOTÊNCIA ───────────────────────────────────────────────────────
 *
 * Toda entrega push é reenviada quando o remetente não vê a resposta — rede lenta, deploy no meio,
 * timeout do lado deles. O `trace_id` acompanha o evento (`"SPXLHLT1O6J006ROW1014ee76c..."`), então
 * ele é único aqui e a segunda entrega do mesmo evento vira um `DO NOTHING` que ainda responde
 * sucesso. Recusar com erro faria a Shopee retentar para sempre um evento que já temos.
 */
export const spxRouterEvents = pgTable(
  "spx_router_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** O identificador do evento no lado da Shopee. Único: reentrega é normal, duplicata não. */
    traceId: text("trace_id").notNull(),
    /** 1 = FM, 2 = LH, 3 = LM. O nosso é o 2; os outros são gravados e ignorados. */
    dataType: integer("data_type"),
    /** A agência a que o evento se refere, como a Shopee identifica. Texto: o exemplo varia. */
    agencyId: text("agency_id"),
    /** `"FM-Trip"`, `"FM-Order"`, `"order_update"`, `"trip_info"` — ausente no LH, que não usa. */
    businessName: text("business_name"),
    /** `trip_number` quando o payload traz um (`"LT1O6J006ROW1"`). É o gancho para `trips`. */
    tripNumber: text("trip_number"),
    /** O `content_data` inteiro, como chegou. A fonte da verdade enquanto não há mapeamento. */
    payload: jsonb("payload").notNull(),
    /** O `timestamp` que o remetente assinou, em UTC. Diferente da hora em que gravamos. */
    signedAt: timestamp("signed_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("spx_router_events_trace_uq").on(table.traceId),
    // "o que chegou dessa viagem?" é a pergunta que se faz olhando uma viagem específica.
    index("spx_router_events_trip_idx").on(table.tripNumber),
    // "está chegando?" é sempre sobre o mais recente — o mesmo diagnóstico dos outros robôs.
    index("spx_router_events_received_idx").on(table.receivedAt.desc()),
  ],
);
