ALTER TABLE "import_batches" ADD COLUMN "source" text DEFAULT 'spreadsheet' NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "summary" jsonb;