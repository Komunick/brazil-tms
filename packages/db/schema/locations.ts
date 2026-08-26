import {
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { customers } from "./customers";

/**
 * Customer-scoped site (data-model §2; LANE-001, LANE-002, Clarification Q3). `customer_id` is a
 * NOT NULL FK — locations belong to exactly one customer (R5); `code` is unique *per customer*
 * (`UNIQUE(customer_id, code)`), so one customer's sites never collide with another's. `country`
 * defaults `'BR'`; `state` is the 2-letter UF (Zod-validated). Soft-delete via `archived_at`.
 */
export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    code: text("code").notNull(),
    /**
     * The id this site carries in the CUSTOMER's own system, when they expose one (2026-08-16).
     * Their portal names a station as "[8300]SoC_RJ_Duque de Caxias" — an id plus a display name —
     * while `code` is the operational code ("SOC-RJ2"). The id is the only exact key: the same
     * customer runs both "SoC_BA_Simoes Filho" (SOC-BA2) and "LM Hub_BA_Simões Filho" (HUB-LBA-17),
     * different sites whose names differ by one accent, so matching their files by name is not
     * merely incomplete — it silently merges two places. Unique per customer; null for sites the
     * customer's system does not name.
     */
    externalStationId: text("external_station_id"),
    name: text("name").notNull(),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    /**
     * A REGIÃO OPERACIONAL da estação, como o cliente a declara (2026-08-20).
     *
     * Três valores, e são os do vocabulário da operação, não os do IBGE: `NONE` (Norte + Nordeste),
     * `SUDESTE` e `SULCO` (Sul + Centro-Oeste). Ficam em texto e não em enum de propósito — a lista
     * é do cliente, muda por decisão dele, e um enum no Postgres não se altera sem migração.
     *
     * O VALOR É COPIADO, NUNCA DEDUZIDO. A tentação é derivar a região da UF, que acerta quase
     * sempre e é código mais curto. Não serve: Palmas/TO e Itaitinga/CE estão em `SULCO` e Guanambi
     * /BA em `SUDESTE`, contra a geografia, porque são exceções que a operação decidiu (confirmado
     * pelo usuário em 2026-08-20). Deduzir apagaria essas decisões e ninguém veria acontecer.
     *
     * Nulo é estação ainda não classificada — não é uma quarta região.
     */
    region: text("region"),
    country: text("country").notNull().default("BR"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    /**
     * DE ONDE VEIO A COORDENADA (2026-08-26, a pedido).
     *
     * As colunas de latitude e longitude existiam desde sempre e estavam VAZIAS nas 459 estações. O
     * que faltava não era a coluna — era a procedência: sem ela ninguém sabe se um ponto foi
     * deduzido pela máquina ou conferido por alguém, e portanto ninguém sabe se pode confiar.
     *
     *   `logae_rota`  deduzida do KML de uma rota da gerenciadora. Precisão de CIDADE — cai sobre
     *                 uma instalação logística real, mas não necessariamente sobre o nosso pátio.
     *   `manual`      alguém marcou no mapa. É a verdade, e a carga automática NUNCA sobrescreve.
     *
     * Essa última regra é o ponto inteiro desta coluna. Sem ela, o job desfaria toda correção
     * humana, e o defeito apareceria como "a coordenada volta sozinha para o lugar errado" — um
     * sintoma que não aponta para causa nenhuma.
     */
    coordenadaOrigem: text("coordenada_origem"),
    coordenadaEm: timestamp("coordenada_em", { withTimezone: true }),
    gateInstructions: text("gate_instructions"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("locations_customer_code_unique").on(table.customerId, table.code),
    // One customer id maps to exactly one site: the guard that keeps a reconciliation mistake from
    // pointing two locations at the same station.
    unique("locations_customer_external_station_unique").on(
      table.customerId,
      table.externalStationId,
    ),
    index("locations_customer_idx").on(table.customerId),
  ],
);
