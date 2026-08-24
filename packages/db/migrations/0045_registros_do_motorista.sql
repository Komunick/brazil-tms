-- O QUE ACONTECEU COM CADA MOTORISTA, escrito por quem viu (2026-08-24, a pedido).
-- Ver `schema/driver-records.ts` para o porquê de cada decisão.
--
-- O TMS sabia MEDIR o motorista e não sabia CONTAR nada sobre ele: reclamação, atraso com
-- explicação, elogio da estação, advertência aplicada — tudo vivia no WhatsApp de quem escalava.
CREATE TABLE IF NOT EXISTS "driver_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "driver_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "texto" text NOT NULL,
  -- A viagem MORRE ANTES DO REGISTRO: a varredura de retiradas apaga viagem que sumiu do portal, e
  -- a advertência tem de sobreviver a isso. `set null` perde o link, nunca o fato.
  "trip_id" uuid,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "driver_records"
  ADD CONSTRAINT "driver_records_driver_id_fk"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "driver_records"
  ADD CONSTRAINT "driver_records_trip_id_fk"
  FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "driver_records"
  ADD CONSTRAINT "driver_records_created_by_user_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint

-- CHECK e não enum: acrescentar uma quinta categoria vira uma linha de migração em vez de um
-- `ALTER TYPE`. A lista é da operação e vai crescer.
ALTER TABLE "driver_records"
  ADD CONSTRAINT "driver_records_tipo_ck"
  CHECK ("tipo" IN ('reclamacao', 'atraso', 'elogio', 'advertencia'));--> statement-breakpoint

-- Categoria sem explicação não ajuda ninguém depois.
ALTER TABLE "driver_records"
  ADD CONSTRAINT "driver_records_texto_ck"
  CHECK (length(btrim("texto")) BETWEEN 1 AND 2000);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "driver_records_driver_idx"
  ON "driver_records" ("driver_id", "created_at" DESC);
