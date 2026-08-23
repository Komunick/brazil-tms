-- O painel de cada usuário (2026-08-23). Ver `schema/user-dashboard-prefs.ts`.
--
-- Guardamos SÓ o que a pessoa escondeu. Cartão criado depois nasce visível para todo mundo, que é
-- o oposto do que aconteceria se a coluna fosse "a lista dos cartões que aparecem".
CREATE TABLE IF NOT EXISTS "user_dashboard_prefs" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "hidden_cards" text[] DEFAULT '{}'::text[] NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
