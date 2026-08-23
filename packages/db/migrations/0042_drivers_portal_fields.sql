-- Tudo o que o portal manda sobre o motorista e o TMS não tem coluna para guardar (2026-08-23).
--
-- Mesmo padrão de `trips.customer_fields`: campo novo no cadastro do fornecedor aparece sem
-- migração. Quem precisar filtrar por algum deles ganha coluna de verdade — a promoção é exceção.
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "portal_fields" jsonb;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "portal_synced_at" timestamp with time zone;
