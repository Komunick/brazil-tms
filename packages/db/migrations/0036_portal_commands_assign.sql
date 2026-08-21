-- Escalar motorista e placa pelo TMS (2026-08-21) — a segunda metade do fluxo do aceite.
--
-- Mora na MESMA fila de ordens porque é a mesma natureza: decisão de gente que precisa sair daqui e
-- chegar ao portal, com o mesmo registro de quem pediu e a mesma prova de que o portal concordou.
--
-- Os três campos são anuláveis: `accept` e `reject` não os usam, e uma ordem antiga não os tem.
ALTER TYPE "portal_command_action" ADD VALUE IF NOT EXISTS 'assign';--> statement-breakpoint
ALTER TABLE "portal_commands" ADD COLUMN IF NOT EXISTS "driver_id" integer;--> statement-breakpoint
ALTER TABLE "portal_commands" ADD COLUMN IF NOT EXISTS "second_driver_id" integer;--> statement-breakpoint
ALTER TABLE "portal_commands" ADD COLUMN IF NOT EXISTS "plates" text;
