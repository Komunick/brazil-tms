-- Os cinco faróis que faltavam, mais a régua do silêncio (2026-08-21).
--
-- A tela do fornecedor mostra OITO ícones por caminhão; o TMS gravava três. Os outros vinham na
-- mesma resposta e eram descartados a cada ciclo. Ver `shared/domain/fleet-alerts.ts` para o
-- mapeamento de cada um e para como ele foi conferido contra a cor do ícone.
--
-- Todas anuláveis e sem default: um robô que ainda não foi atualizado continua entregando o retrato
-- inteiro, e coluna nula aqui é "esta leitura é anterior ao alerta", não "está tudo bem".
ALTER TABLE "fleet_positions" ADD COLUMN IF NOT EXISTS "driving_time_flag" text;--> statement-breakpoint
ALTER TABLE "fleet_positions" ADD COLUMN IF NOT EXISTS "late_start_flag" text;--> statement-breakpoint
ALTER TABLE "fleet_positions" ADD COLUMN IF NOT EXISTS "blocked_flag" text;--> statement-breakpoint
ALTER TABLE "fleet_positions" ADD COLUMN IF NOT EXISTS "siren_flag" text;--> statement-breakpoint
ALTER TABLE "fleet_positions" ADD COLUMN IF NOT EXISTS "release_label" text;--> statement-breakpoint
ALTER TABLE "fleet_positions" ADD COLUMN IF NOT EXISTS "trip_delay_flag" text;--> statement-breakpoint
ALTER TABLE "fleet_positions" ADD COLUMN IF NOT EXISTS "no_position_limit_minutes" integer;
