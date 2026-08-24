-- Seis campos que já vinham na mesma resposta do rastreador (2026-08-24, a pedido).
--
-- Escolhidos com a resposta real na mão. Dos 380 campos, 159 vêm sempre nulos para a frota inteira
-- e a maior parte do resto é cadastro interno do rastreador; guardar tudo cru custaria ~250 MB por
-- dia de reescrita para carregar esse lixo junto. Dois candidatos óbvios pelo NOME caíram na
-- medição: `OBSERVACOES_COLETA_ENTREGA` tem dois valores distintos em 67 registros, e
-- `SMK_DATAHORACHEGADADESTINO` vem preenchido inclusive para veículo sem viagem — é sentinela.
--
-- Todas anuláveis: um robô ainda não atualizado continua entregando o retrato inteiro.
ALTER TABLE "fleet_positions" ADD COLUMN IF NOT EXISTS "driver_phone" text;--> statement-breakpoint
ALTER TABLE "fleet_positions" ADD COLUMN IF NOT EXISTS "driver_city" text;--> statement-breakpoint
ALTER TABLE "fleet_positions" ADD COLUMN IF NOT EXISTS "km_today" double precision;--> statement-breakpoint
ALTER TABLE "fleet_positions" ADD COLUMN IF NOT EXISTS "departed_origin_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fleet_positions" ADD COLUMN IF NOT EXISTS "arrived_destination_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fleet_positions" ADD COLUMN IF NOT EXISTS "stopped_minutes_total" integer;
