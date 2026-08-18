DROP INDEX "trips_customer_external_id_uq";--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "leg_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "trips_customer_external_id_uq" ON "trips" USING btree ("customer_id","external_trip_id","leg_number") WHERE "trips"."external_trip_id" IS NOT NULL;