-- LOCAL DEV ONLY. Runs once on a fresh Postgres data dir (/docker-entrypoint-initdb.d).
-- GoTrue creates tables INSIDE the auth schema and issues UNQUALIFIED queries that rely on
-- search_path=auth. So GoTrue must connect as a role whose search_path is `auth` (the official
-- supabase_auth_admin). Our app connects as `postgres` (search_path public) — cleanly separated.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Dedicated GoTrue role. SUPERUSER for local simplicity (lets GoTrue own auth + create anything);
-- password matches POSTGRES_PASSWORD ('postgres') used by the base compose's GOTRUE_DB_DATABASE_URL.
DO $$ BEGIN
  CREATE ROLE supabase_auth_admin LOGIN PASSWORD 'postgres' SUPERUSER;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER ROLE supabase_auth_admin SET search_path = auth;
ALTER SCHEMA auth OWNER TO supabase_auth_admin;
