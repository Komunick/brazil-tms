import { sql } from "drizzle-orm";
import { check, date, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { carriers } from "./carriers";
import { ownershipType, resourceStatus } from "./enums";

/**
 * Driver resource (data-model §4; RES-001, RES-002). `ownership_type` is mandatory (R4) and a CHECK
 * enforces the invariant `subcontracted ⇒ carrier_id set` / `owned ⇒ carrier_id null`. `status` is
 * the operational `resource_status` (R3), orthogonal to `archived_at`. `license_expiry` feeds the
 * derived documentation-expiry warning (R9, computed in the service, never stored).
 *
 * `email` is DORMANT (issue #28 [0005] replaced it with `cpf` across the product surface): the
 * column must stay mapped here — removing it makes the next `drizzle-kit generate` emit a
 * data-destroying DROP COLUMN — but nothing reads or writes it anymore.
 */
export const drivers = pgTable(
  "drivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"), // dormant — see the table doc comment
    cpf: text("cpf"),
    /**
     * O ID DESTE MOTORISTA NO PORTAL DO CLIENTE (2026-08-23).
     *
     * A única chave que os dois cadastros compartilham de verdade. Sem ela, casar motorista do
     * portal com motorista do TMS é casar por NOME — e nome é frágil por natureza: um acento fora do
     * lugar já custou três motoristas que existiam e o sistema jurava não existirem.
     *
     * Nasce na importação do cadastro do portal e é o que permite a próxima carga ser exata em vez
     * de aproximada. Nulo é o normal para quem foi cadastrado à mão aqui e nunca apareceu lá.
     */
    portalDriverId: text("portal_driver_id"),
    /**
     * TUDO O QUE O PORTAL MANDA E O TMS NÃO TEM COLUNA PARA GUARDAR (2026-08-23, a pedido).
     *
     * Endereço, nascimento, RENAVAM, fabricante e ano do veículo, dono, estações, taxas, tipo de
     * contrato — são uns cinquenta campos, e criar cinquenta colunas para dados que ninguém filtra
     * seria pagar migração por cada mudança de cadastro do fornecedor.
     *
     * É o MESMO padrão que a viagem já usa em `customer_fields`, e pela mesma razão: campo novo na
     * semana que vem aparece sem migração. Quem precisar FILTRAR por algum deles ganha uma coluna
     * de verdade — a promoção é a exceção, não a regra.
     *
     * Guardado como o portal manda, sem tradução: no dia em que ele renomear um campo, a diferença
     * fica visível aqui em vez de sumir num mapeamento nosso.
     */
    portalFields: jsonb("portal_fields"),
    /** Quando o robô leu este motorista pela última vez. É o relógio de "o cadastro está fresco?". */
    portalSyncedAt: timestamp("portal_synced_at", { withTimezone: true }),
    licenseNumber: text("license_number"),
    licenseCategory: text("license_category"),
    licenseExpiry: date("license_expiry"),
    ownershipType: ownershipType("ownership_type").notNull(),
    carrierId: uuid("carrier_id").references(() => carriers.id),
    employer: text("employer"),
    status: resourceStatus("status").notNull().default("active"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Frota própria sem transportadora; todo o resto com — ver o comentário longo em `vehicles.ts`.
    // Enumerar os valores (a forma antiga) faria `agregado` e `terceiro` serem recusados pelo banco.
    check(
      "drivers_ownership_carrier_ck",
      sql`(${table.ownershipType} = 'owned' AND ${table.carrierId} IS NULL) OR (${table.ownershipType} <> 'owned' AND ${table.carrierId} IS NOT NULL)`,
    ),
    index("drivers_carrier_idx").on(table.carrierId),
    index("drivers_status_idx").on(table.status),
  ],
);
