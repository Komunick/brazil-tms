import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Slice 025 (issue #32 [0009]) — registry attachments for drivers and vehicles ("Documentos" tab):
 * an APPEND-ONLY upload history. Deliberately separate from the shipped 008 `documents` table,
 * which is trip-scoped and carries verification/billing semantics that do not apply here.
 *
 * The binary lives ONLY in Supabase Storage (private `documents` bucket, `resources/…` key —
 * STACK §3.9); this row is metadata. `entity_type` is a CHECK-constrained text (not a pgEnum) so
 * adding `trailer` later is a one-line CHECK swap, not enum surgery. `entity_id` is polymorphic
 * (drivers.id or vehicles.id) — the service preflights existence; no cross-table FK is possible.
 * No update/delete surface: history is the product requirement (append-only + audit per upload).
 */
export const resourceDocuments = pgTable(
  "resource_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * `preregistration` entrou na 028, e DE PROPÓSITO só aqui.
     *
     * O CHECK do banco passou a aceitar os três (migração 0057) porque a foto do pré-cadastro é
     * mandada por quem ainda NÃO é motorista, e pendurá-la num `drivers` inventado seria criar
     * cadastro a partir de formulário público.
     *
     * Mas `RESOURCE_DOCUMENT_ENTITY_TYPES`, no pacote compartilhado, continua sendo só
     * `driver | vehicle`: aquilo é o vocabulário das ROTAS DE FROTA, o que o segmento de URL
     * aceita. Alargá-lo faria a rota autenticada de frota passar a receber `preregistration` e cair
     * dentro de `assertResourceDocumentParent`, que procura o pai em `drivers`/`vehicles` e não
     * acharia nada. Este tipo descreve a COLUNA; aquele descreve a porta.
     */
    /*
      `user` entrou na fatia 029 — a foto de perfil (migração `0060` alargou o CHECK).

      Vale para ele exatamente o que já valia para `preregistration`, e é o que o comentário acima
      explica: este tipo descreve a COLUNA; `RESOURCE_DOCUMENT_ENTITY_TYPES` descreve a PORTA das
      rotas de frota, e continua `driver | vehicle`. A foto entra por rota própria
      (`lib/perfil/foto.ts`), que não passa pelo serviço de frota.
    */
    entityType: text("entity_type")
      .$type<"driver" | "vehicle" | "preregistration" | "user">()
      .notNull(),
    entityId: uuid("entity_id").notNull(),
    docType: text("doc_type").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    fileStorageKey: text("file_storage_key").notNull().unique(),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "resource_documents_entity_type_ck",
      sql`${table.entityType} IN ('driver', 'vehicle', 'preregistration')`,
    ),
    index("resource_documents_entity_idx").on(table.entityType, table.entityId, table.createdAt),
  ],
);
