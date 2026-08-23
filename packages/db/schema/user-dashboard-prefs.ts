import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * O painel de cada usuário — só o que ele ESCONDEU (2026-08-23, a pedido).
 *
 * Ver `schemas/dashboard-prefs.ts` no `shared` para o porquê de guardar o desvio e não a lista do
 * que aparece: é o que faz um cartão criado depois nascer visível para quem já personalizou.
 *
 * Uma linha por usuário, `user_id` como chave primária — não há segunda preferência de painel por
 * pessoa, e uma chave surrogate só abriria a porta para duas linhas contraditórias. `on delete
 * cascade` porque isto é preferência de tela: usuário removido não deixa nada para trás aqui.
 */
export const userDashboardPrefs = pgTable("user_dashboard_prefs", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  hiddenCards: text("hidden_cards")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
