import { sql } from "drizzle-orm";
import { db } from "../client";
import { resourceDocuments } from "../../schema";
import { eq } from "drizzle-orm";
import { writeAudit } from "../audit/write-audit";

/**
 * AS FOTOS QUE PASSARAM DOS 90 DIAS (fatia 029, FR-024).
 *
 * ── O ALVO É ESTREITO DE PROPÓSITO ────────────────────────────────────────────────────────────
 *
 * `status = 'disabled'` **e** `desativado_em` além do prazo. As duas condições, e não uma:
 *
 *   • só o status pegaria quem foi desativado ontem;
 *   • só a data pegaria quem foi desativado, voltou, e continua trabalhando — porque a reativação
 *     zera a coluna, mas uma consulta que não olhasse o status leria linhas antigas.
 *
 * Quem foi reativado dentro do prazo tem `desativado_em` NULO, e some do alvo sozinho. É assim que a
 * reativação "para o relógio" sem nenhuma regra especial.
 */
export const PRAZO_DA_FOTO_DIAS = 90;

export interface FotoVencida {
  documentId: string;
  userId: string;
  fileStorageKey: string;
}

export async function fotosVencidas(dias = PRAZO_DA_FOTO_DIAS): Promise<FotoVencida[]> {
  const linhas = await db.execute<{
    document_id: string;
    user_id: string;
    file_storage_key: string;
  }>(sql`
    select rd.id as document_id, rd.entity_id as user_id, rd.file_storage_key
      from resource_documents rd
      join users u on u.id = rd.entity_id
     where rd.entity_type = 'user'
       and rd.doc_type = 'foto_perfil'
       and u.status = 'disabled'
       and u.desativado_em is not null
       and u.desativado_em < now() - make_interval(days => ${dias})
     order by rd.created_at
  `);
  return linhas.map((l) => ({
    documentId: l.document_id,
    userId: l.user_id,
    fileStorageKey: l.file_storage_key,
  }));
}

/**
 * Apaga a LINHA da foto e registra o descarte.
 *
 * O objeto no bucket é apagado por quem chama, ANTES — o worker, que tem o cliente de armazenamento.
 * A ordem importa: linha sem objeto vira cartão quebrado; objeto sem linha vira lixo que ninguém
 * encontra. Apagar o objeto primeiro e a linha depois deixa, no pior caso, uma linha órfã que a
 * próxima varredura encontra e limpa — que é o lado recuperável do erro.
 *
 * É a ÚNICA exclusão real desta fatia, e por isso ela é auditada (princípio III).
 */
export async function descartarFoto(
  foto: FotoVencida,
  autorUserId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(resourceDocuments).where(eq(resourceDocuments.id, foto.documentId));
    await writeAudit(tx, {
      entityType: "user",
      entityId: foto.userId,
      action: "user.foto_descartada",
      previousValue: { documentId: foto.documentId, fileStorageKey: foto.fileStorageKey },
      newValue: null,
      actorUserId: autorUserId,
      reason: `Descarte automático após ${PRAZO_DA_FOTO_DIAS} dias de conta desativada.`,
    });
  });
}
