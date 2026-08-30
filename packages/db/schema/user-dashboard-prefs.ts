import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
  /**
   * Os cartões que a pessoa deixou ENCOLHIDOS — hoje só o BSC, que ocupa a linha inteira.
   *
   * Coluna própria em vez de uma marca dentro de `hidden_cards`: escondido e minimizado são
   * estados diferentes do mesmo cartão, e juntá-los obrigaria a inventar um prefixo — que é onde
   * este tipo de lista começa a virar linguagem secreta que só o código entende.
   */
  minimizedCards: text("minimized_cards")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /**
   * OS FILTROS DA MINHA PROGRAMAÇÃO que a pessoa deixou ligados (30/08, a pedido).
   *
   * `jsonb` e não três colunas: ao contrário da lista de cartões, os filtros desta tela ainda mudam
   * toda semana, e três colunas hoje virariam uma migração a cada filtro novo. É preferência de
   * tela — preferência errada não corrompe nada — e o Zod valida a forma antes de gravar.
   *
   * Não entrou aqui, e é decisão: a BUSCA (transitória — ninguém espera reencontrar o texto que
   * digitou ontem) e os DIAS ESCONDIDOS (são datas; "esconder 30/08" não quer dizer nada em 05/09,
   * e voltaria como um filtro que não filtra).
   */
  programacaoPrefs: jsonb("programacao_prefs").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
