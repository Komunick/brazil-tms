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
    country: text("country").notNull().default("BR"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
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
