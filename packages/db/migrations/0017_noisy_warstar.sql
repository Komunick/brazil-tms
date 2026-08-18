DROP INDEX "import_rows_batch_row_uq";--> statement-breakpoint
ALTER TABLE "import_rows" ADD COLUMN "leg_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "import_rows_batch_row_uq" ON "import_rows" USING btree ("import_batch_id","row_number","leg_number");