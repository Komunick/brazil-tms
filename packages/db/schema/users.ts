import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { appRole } from "./enums";

/**
 * `auth.users` is owned by GoTrue — declared here ONLY so we can reference it for the FK.
 * It is NOT created or migrated by us (drizzle.config schemaFilter is ["public"]).
 */
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

/**
 * Application profile + role binding (data-model.md). `id` mirrors `auth.users.id` (1:1, no
 * surrogate key). No hard delete — disabling sets `status='disabled'` (Constitution III).
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    role: appRole("role").notNull(),
    // 'pending' | 'active' | 'disabled' — enforced by the CHECK below and the shared Zod schemas.
    status: text("status").notNull(),
    /**
     * O SETOR DA PASSAGEM DE TURNO — e ele NÃO é um papel (2026-08-26).
     *
     * `role` diz o que a pessoa pode FAZER no TMS e alimenta a matriz de permissões. `setor` diz
     * qual FAIXA do diário de turno ela responde. Um `dispatcher` pode estar em PROGRAMAÇÃO ou em
     * SPOT; um `control_tower` em GR ou em Monitoring. Somar as duas coisas num enum só
     * multiplicaria os oito papéis por cinco e quebraria a matriz inteira.
     *
     * NULO É O NORMAL: a maioria dos usuários não faz passagem de turno. Quem não tem setor lê
     * tudo e não edita nada, que é o certo para quem só acompanha.
     */
    setor: text("setor"),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("users_role_idx").on(table.role),
    check("users_status_check", sql`${table.status} in ('pending', 'active', 'disabled')`),
    check(
      "users_setor_ck",
      sql`${table.setor} is null or ${table.setor} in ('PROGRAMACAO', 'SPOT', 'EMISSAO', 'GR', 'MONITORING')`,
    ),
  ],
);
