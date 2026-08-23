-- Minha Programação: as viagens que cada pessoa escolheu acompanhar (2026-08-23).
-- Ver `schema/user-watched-trips.ts` para o porquê da chave composta e da cascata nos dois lados.
CREATE TABLE IF NOT EXISTS "user_watched_trips" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "trip_id" uuid NOT NULL REFERENCES "trips"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_watched_trips_pkey" PRIMARY KEY ("user_id", "trip_id")
);--> statement-breakpoint
-- A consulta da tela é sempre "as minhas, na ordem em que entraram".
CREATE INDEX IF NOT EXISTS "user_watched_trips_user_idx"
  ON "user_watched_trips" ("user_id", "created_at");
