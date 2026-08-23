import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { locations } from "./locations";
import { vehicleType } from "./enums";

/**
 * Origin→destination lane for a customer (data-model §3; LANE-003, LANE-004). Both endpoints are
 * FKs into `locations`; a CHECK forbids the degenerate origin = destination lane. The cross-row
 * rule "origin/destination/customer all active and same customer" spans rows and is enforced in the
 * service layer (R5, `409 INVALID_LANE_REFERENCE`), not as a CHECK. Money is integer centavos, BRL
 * (R7); `default_vehicle_type` shares the `vehicle_type` enum for later lane↔vehicle matching.
 */
export const lanes = pgTable(
  "lanes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    originLocationId: uuid("origin_location_id")
      .notNull()
      .references(() => locations.id),
    destinationLocationId: uuid("destination_location_id")
      .notNull()
      .references(() => locations.id),
    expectedTransitMinutes: integer("expected_transit_minutes"),
    defaultVehicleType: vehicleType("default_vehicle_type"),
    standardRateCents: bigint("standard_rate_cents", { mode: "number" }),
    tollEstimateCents: bigint("toll_estimate_cents", { mode: "number" }),
    standardDistanceKm: numeric("standard_distance_km"),
    /**
     * ESTA ROTA É NOSSA? (2026-08-23, a pedido.)
     *
     * A lane existe assim que o par aparece — `resolveLaneId` a cria na primeira viagem, venha ela
     * de onde vier. Isso é bom para relatório e péssimo para alarme: o portal mostra à
     * transportadora tanto as viagens que já são dela quanto as ofertas em aberto, e sem esta
     * coluna o painel cobrava atribuição de rota que a empresa não roda.
     *
     * `false` por padrão: rota nova nasce fora da malha e alguém diz que entrou. O contrário —
     * nascer dentro — faria cada oferta do portal virar trabalho nosso em silêncio, que é
     * exatamente o defeito que esta coluna existe para consertar.
     */
    inNetwork: boolean("in_network").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("lanes_origin_dest_ck", sql`${table.originLocationId} <> ${table.destinationLocationId}`),
    // A lane IS its (customer, origin, destination) — trips resolve to one by that triple, so two
    // live rows for the same triple would make the resolution ambiguous and split a lane's history
    // in the reports. Partial: an archived lane steps aside and lets a fresh one take the pair.
    uniqueIndex("lanes_customer_route_uq")
      .on(table.customerId, table.originLocationId, table.destinationLocationId)
      .where(sql`${table.archivedAt} is null`),
    index("lanes_customer_idx").on(table.customerId),
    index("lanes_origin_idx").on(table.originLocationId),
    index("lanes_dest_idx").on(table.destinationLocationId),
  ],
);
