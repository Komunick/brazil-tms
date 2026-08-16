import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { importTemplates } from "./import-templates";
import { users } from "./users";
import { importBatchStatus } from "./enums";

/**
 * Import batch (data-model §2) — one uploaded file's run through the pipeline (R3). The BFF records
 * the row (`file_name`, `storage_key`, `uploaded_by`) and enqueues; the worker advances `status`
 * (`import_batch_status`) and fills the count rollups. `template_id` is nullable (auto-detect /
 * unmatched uploads). `error_report_storage_key` / `error_message` retained on failure.
 */
export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    templateId: uuid("template_id").references(() => importTemplates.id),
    fileName: text("file_name").notNull(),
    storageKey: text("storage_key").notNull(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    status: importBatchStatus("status").notNull().default("received"),
    /**
     * WHERE this import came from (2026-08-16). The spreadsheet path streams through the worker;
     * the two portal paths apply synchronously and used to leave no trace at all — the operator saw
     * the result once and lost it on the next click, which for a daily routine means "12 estações
     * não resolvidas" is read by one person and then gone. Recording them here puts every import,
     * whatever its shape, on the same history screen.
     */
    source: text("source").notNull().default("spreadsheet"),
    /**
     * The full outcome of a portal import, verbatim from the service — the counts the five columns
     * below cannot express (already-ahead legs, unresolved stations, milestones) plus the station
     * list an operator needs to act on. Null for spreadsheet batches, which the columns describe.
     */
    summary: jsonb("summary"),
    totalRows: integer("total_rows").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    errorReportStorageKey: text("error_report_storage_key"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("import_batches_customer_idx").on(table.customerId),
    index("import_batches_created_idx").on(table.createdAt.desc()),
  ],
);
