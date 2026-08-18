import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { TripStatus } from "@brazil-tms/shared";
import { customers } from "./customers";
import { locations } from "./locations";
import { lanes } from "./lanes";
import { cancellationResponsibleParty, tripStatus, vehicleType } from "./enums";

/**
 * Durable trip — the operations system-of-record (data-model §1; TRIP-006, TRIP-007,
 * FR-001..FR-012, FR-015..FR-022). Built on 002 master data: `customer_id`, both location ends, and
 * the optional `lane_id` are FKs into 002 (`ON DELETE NO ACTION` — master data is archived, not
 * deleted, so trips never dangle).
 *
 * Planned-vs-executed (TRIP-006, R4) lives in three layers:
 *   1. `original_plan` jsonb — an IMMUTABLE snapshot of the imported plan, written once at create and
 *      never overwritten by any service (SC-002).
 *   2. live `planned_*` columns — the CURRENT accepted plan, updatable only via the audited
 *      `updateTripPlan` service (R5).
 *   3. EXECUTED values are NOT columns — they are `trip_events` rows (R6); an actual arrival never
 *      overwrites a planned column.
 *
 * `current_status` is the single `trip_status` machine (R2); legality is enforced in the service
 * layer against the shared `TRANSITIONS` table, not a DB trigger (R1). `sla_status` is a placeholder
 * NOT computed here (007 owns it). Cancellation columns are set only on transition to `cancelled`;
 * `disputed_from_status` records where `disputed` was entered from for the round-trip (FR-011).
 *
 * Deferred to later slices (R12): assignment columns/`trip_assignments` (006), `exceptions` (007),
 * SLA computation (007), document/rate/billing-export columns (008). `import_batch_id` is a forward
 * hook with no FK until 004.
 */
export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    externalTripId: text("external_trip_id"),
    /**
     * Which leg of the customer's programming this trip is (1 when there is only one).
     *
     * The customer's id names an OPERATION, which can be more than one movement: a milk run ends a
     * leg and departs from that same site on the next. Each leg is its own trip — it has its own
     * pickup, delivery, proof and SLA — so the identifier alone can no longer be unique; the unique
     * key is (customer, external id, leg). The id itself is stored exactly as the customer wrote it.
     */
    legNumber: integer("leg_number").notNull().default(1),
    importBatchId: uuid("import_batch_id"),
    originLocationId: uuid("origin_location_id")
      .notNull()
      .references(() => locations.id),
    destinationLocationId: uuid("destination_location_id")
      .notNull()
      .references(() => locations.id),
    laneId: uuid("lane_id").references(() => lanes.id),
    // slice 015: `.$type<TripStatus>()` pins the column to the 16-value active machine (type-only; the
    // pgEnum still has 18 physical members, 2 dormant). No generated SQL diff.
    currentStatus: tripStatus("current_status").notNull().default("received").$type<TripStatus>(),
    slaStatus: text("sla_status"),
    // feature 007 — server-computed SLA risk (D4): `sla_status` stays text (CHECK-validated, no enum);
    // `sla_reasons` is the schema's first `.array()` column (text[]). Both written atomically.
    slaReasons: text("sla_reasons").array(),
    originalPlan: jsonb("original_plan").notNull(),
    /**
     * Columns the customer's file carries that the TMS has no field for — region, request type,
     * checklist, CT-e… Kept as `{ rótulo: valor }` so a new column in next week's spreadsheet shows
     * up on the trip WITHOUT a migration (Constitution V: customer variation is config, not code).
     * Display-only by design: anything the operation needs to FILTER on gets promoted to a real
     * column instead. Written by the import (`customer.*` template targets); never by hand.
     */
    customerFields: jsonb("customer_fields"),
    /**
     * The operational annotations the TEAM owns — solicitação, checklist, SM Raster, CT-e, doca.
     * Same `{ rótulo: valor }` shape as `customer_fields` and deliberately a SEPARATE column: those
     * are what the customer's file says, these are what our operation decided, and an import must
     * never overwrite a person's entry. They exist so the fields that today live only in a
     * hand-maintained spreadsheet have a home here — the step that lets that spreadsheet be
     * switched off (2026-08-15). Written only through `updateOperationalFields`.
     */
    operationalFields: jsonb("operational_fields"),
    /**
     * O preço que o CLIENTE declara por esta viagem — o que a Brazil Transports recebe por ela
     * (2026-08-16). Vem do "Valor da Viagem" do portal, capturado no ciclo do plano porque some
     * depois que a viagem termina. Centavos inteiros (R7).
     *
     * Coluna própria, e não `customer_fields`: dinheiro não mora num campo de texto de exibição —
     * daqui ele alimenta a base do item de faturamento, que antes ficava sem preço nenhum porque
     * dependia de uma tabela de tarifas por rota que a operação não mantém.
     */
    customerPriceCents: bigint("customer_price_cents", { mode: "number" }),
    plannedPickupWindowStart: timestamp("planned_pickup_window_start", { withTimezone: true }),
    plannedPickupWindowEnd: timestamp("planned_pickup_window_end", { withTimezone: true }),
    plannedDeliveryWindowStart: timestamp("planned_delivery_window_start", { withTimezone: true }),
    plannedDeliveryWindowEnd: timestamp("planned_delivery_window_end", { withTimezone: true }),
    plannedVehicleType: vehicleType("planned_vehicle_type"),
    plannedVolumeUnits: integer("planned_volume_units"),
    plannedWeightKg: integer("planned_weight_kg"),
    plannedPalletCount: integer("planned_pallet_count"),
    plannedRouteNotes: text("planned_route_notes"),
    plannedServiceRequirements: jsonb("planned_service_requirements"),
    cancellationReasonCode: text("cancellation_reason_code"),
    cancellationResponsibleParty: cancellationResponsibleParty("cancellation_responsible_party"),
    cancellationBillingImpact: text("cancellation_billing_impact"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    disputedFromStatus: tripStatus("disputed_from_status").$type<TripStatus>(),
    /**
     * A última vez que esta viagem apareceu numa listagem do portal (2026-08-18).
     *
     * Existe para responder uma pergunta que nenhum outro campo responde: o cliente RETIROU esta
     * viagem? O portal não avisa — a proposta simplesmente some do Planejado. Medido num único dia:
     * 14 das 16 viagens recebidas naquele dia deixaram de existir lá, e do lado de cá seguiam vivas,
     * cobrando atribuição e alertando.
     *
     * É coluna, e não mais um campo em `customer_fields`, por dois motivos. O mapa de campos só é
     * gravado quando algo MUDA — pôr um carimbo de tempo ali faria toda viagem ser reescrita a cada
     * ciclo do robô, quinze em quinze minutos. E é uma pergunta de tempo, que quer índice.
     *
     * NULO quer dizer "nunca visto numa listagem", e é diferente de "sumiu": a viagem digitada à mão
     * nunca terá carimbo, e não pode ser confundida com uma retirada pelo cliente.
     */
    portalLastSeenAt: timestamp("portal_last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("trips_origin_dest_ck", sql`${table.originLocationId} <> ${table.destinationLocationId}`),
    // feature 007 — validate sla_status to the four risk states (D4 — text + CHECK, no enum).
    check(
      "trips_sla_status_ck",
      sql`${table.slaStatus} IS NULL OR ${table.slaStatus} IN ('on_track','at_risk','late','breached')`,
    ),
    // A customer's own trip id is unique within that customer when present (import matching/updates).
    // The no-duplicate guarantee, now leg-aware: re-importing a file still cannot create a second
    // copy of the same movement, and a milk run's legs coexist under one customer id.
    uniqueIndex("trips_customer_external_id_uq")
      .on(table.customerId, table.externalTripId, table.legNumber)
      .where(sql`${table.externalTripId} IS NOT NULL`),
    index("trips_customer_idx").on(table.customerId),
    index("trips_status_idx").on(table.currentStatus),
    index("trips_created_idx").on(table.createdAt.desc()),
    // 005 (R5): backs date-range filters, the Today/Next-24h views, default active ordering by pickup,
    // and the "trips today by status" dashboard count.
    index("trips_pickup_start_idx").on(table.plannedPickupWindowStart),
    // A varredura de retiradas pergunta "quem não é visto há horas?" — parcial, porque só viagem
    // que veio do portal (com carimbo) pode ter sido retirada dele.
    index("trips_portal_last_seen_idx")
      .on(table.portalLastSeenAt)
      .where(sql`${table.portalLastSeenAt} IS NOT NULL`),
  ],
);
