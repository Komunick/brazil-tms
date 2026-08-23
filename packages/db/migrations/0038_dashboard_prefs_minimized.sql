-- O cartão minimizado, por usuário (2026-08-23). Ver `schema/user-dashboard-prefs.ts`.
--
-- Coluna própria e não uma marca dentro de `hidden_cards`: escondido e minimizado são estados
-- diferentes do mesmo cartão, e enfiar os dois no mesmo array obrigaria a inventar um prefixo — que
-- é onde essas listas começam a virar linguagem secreta.
ALTER TABLE "user_dashboard_prefs"
  ADD COLUMN IF NOT EXISTS "minimized_cards" text[] DEFAULT '{}'::text[] NOT NULL;
