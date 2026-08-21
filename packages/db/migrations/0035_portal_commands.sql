-- A primeira vez que o TMS MANDA no portal, e não só escuta (2026-08-21).
--
-- Ver `schema/portal-commands.ts` para o porquê de uma ordem gravada em vez de uma chamada direta:
-- quem tem sessão no portal é o navegador da VM, não este servidor — e a ordem é o que torna a
-- decisão auditável, coisa que um clique no portal nunca deixou.
CREATE TYPE "portal_command_action" AS ENUM('accept', 'reject');--> statement-breakpoint
CREATE TYPE "portal_command_status" AS ENUM('pending', 'sent', 'done', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_commands" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trip_id" uuid NOT NULL REFERENCES "trips"("id"),
  "portal_trip_id" text NOT NULL,
  "external_trip_id" text,
  "action" "portal_command_action" NOT NULL,
  "reason_id" integer,
  "remark" text,
  "status" "portal_command_status" DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "response" jsonb,
  "last_error" text,
  "requested_by" uuid NOT NULL REFERENCES "users"("id"),
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "claimed_at" timestamp with time zone,
  "settled_at" timestamp with time zone
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_commands_status_idx" ON "portal_commands" ("status","requested_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_commands_trip_idx" ON "portal_commands" ("trip_id");--> statement-breakpoint
-- UMA ordem aberta por viagem. Dois cliques apressados viravam dois POSTs, e "aceitar duas vezes" é
-- erro que não se desfaz do nosso lado. Ordem terminada não bloqueia: rejeitar depois de uma
-- tentativa que falhou é caso real.
CREATE UNIQUE INDEX IF NOT EXISTS "portal_commands_uma_aberta_por_viagem"
  ON "portal_commands" ("trip_id") WHERE "status" IN ('pending', 'sent');
