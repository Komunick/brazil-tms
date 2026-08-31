import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, resourceDocuments, users } from "@brazil-tms/db";
import {
  documentsBucket,
  putDocument,
  removeObject,
  resourceDocumentStorageKey,
  signedUrl,
} from "@/lib/supabase/storage";
import { writeAudit } from "@/lib/audit/write-audit";
import { Conflict, NotFound } from "@/lib/api/respond";

/**
 * A FOTO DE PERFIL (fatia 029, US2) — no armazenamento privado que a 025 já entregou.
 *
 * ── POR QUE NÃO PASSA PELO SERVIÇO DE FROTA ───────────────────────────────────────────────────
 *
 * `resource-documents-service.ts` é cravado em `driver | vehicle`: ele escolhe a tabela do pai com
 * um ternário e confere `archivedAt`, coluna que `users` não tem. Enfiar `user` ali obrigaria a
 * alargar também `RESOURCE_DOCUMENT_ENTITY_TYPES` — a PORTA das rotas de frota —, e aí a rota de
 * frota passaria a aceitar `user` no segmento de URL e procuraria o pai onde ele não está.
 *
 * O que se reaproveita é a MÁQUINA: o mesmo bucket privado, a mesma chave, o mesmo link de curta
 * duração, a mesma tabela. O que não se reaproveita é a porta.
 *
 * ── A FOTO ATUAL É A MAIS RECENTE ─────────────────────────────────────────────────────────────
 *
 * Nada é apagado ao trocar (princípio III): o histórico responde "quem trocou a foto de quem, e
 * quando" sem trabalho a mais. A única exclusão real é o descarte aos 90 dias (FR-024), que é do
 * worker.
 */

export const DOC_TYPE_FOTO = "foto_perfil";

/** Só imagem, e só as duas que todo navegador produz. PDF de rosto não existe. */
const FORMATOS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
};

/**
 * 2 MB — teto menor que o dos documentos, e de propósito.
 *
 * Uma foto de rosto de 2 MB já é grande demais para o que a tela mostra (um círculo de 40 pixels).
 * O teto existe para que o bucket não vire depósito de foto de celular em resolução cheia, e o
 * limite é dito na recusa para a pessoa saber o que fazer.
 */
export const TETO_DA_FOTO_BYTES = 2 * 1024 * 1024;

export interface FotoDeAlguem {
  documentId: string;
  fileStorageKey: string;
}

/** A foto atual de alguém, ou nulo. É sempre a mais recente. */
export async function fotoAtual(userId: string): Promise<FotoDeAlguem | null> {
  const linhas = await db
    .select({ id: resourceDocuments.id, fileStorageKey: resourceDocuments.fileStorageKey })
    .from(resourceDocuments)
    .where(
      and(
        eq(resourceDocuments.entityType, "user"),
        eq(resourceDocuments.entityId, userId),
        eq(resourceDocuments.docType, DOC_TYPE_FOTO),
      ),
    )
    // id como desempate: dois envios no mesmo microssegundo mantêm ordem estável.
    .orderBy(desc(resourceDocuments.createdAt), desc(resourceDocuments.id))
    .limit(1);
  const l = linhas[0];
  return l ? { documentId: l.id, fileStorageKey: l.fileStorageKey } : null;
}

/**
 * Link de curta duração para a foto — nunca endereço público permanente (FR-022).
 *
 * Cinco minutos: tempo de a tela carregar e a imagem aparecer. Um link longo circula por aí — copiado
 * de um `inspecionar elemento`, colado num chat — e passa a mostrar o rosto de um funcionário para
 * quem não está autenticado. Curto, ele expira antes de virar link.
 */
const VALIDADE_DO_LINK_SEGUNDOS = 300;

export async function urlDaFoto(key: string): Promise<string> {
  return signedUrl(key, VALIDADE_DO_LINK_SEGUNDOS, documentsBucket());
}

/**
 * Guarda uma foto nova. Recusa formato e tamanho ANTES de escrever qualquer coisa (FR-021).
 *
 * A ordem é: confere a pessoa → confere o arquivo → sobe o binário → grava a linha. Se a gravação
 * falhar, o binário é removido — senão fica um objeto no bucket que nenhuma linha aponta, e que
 * ninguém encontra para apagar.
 */
export async function guardarFoto(
  alvoUserId: string,
  arquivo: { nome: string; contentType: string; bytes: Buffer },
  autorUserId: string,
): Promise<void> {
  const alvo = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.id, alvoUserId))
    .limit(1);
  const pessoa = alvo[0];
  if (!pessoa) throw new NotFound("NOT_FOUND", "Usuário não encontrado.");
  /*
    O equivalente ao `archivedAt` da frota: quem está desativado não recebe foto nova. A foto dele
    tem prazo para sumir (FR-024) — subir uma agora seria criar dado pessoal com data de validade
    já correndo.
  */
  if (pessoa.status === "disabled") {
    throw new Conflict("USUARIO_DESATIVADO", "Usuário desativado não recebe foto nova.");
  }

  const ext = FORMATOS[arquivo.contentType.toLowerCase()];
  if (!ext) {
    throw new Conflict("FORMATO_NAO_ACEITO", "A foto precisa ser PNG ou JPEG.");
  }
  if (arquivo.bytes.byteLength > TETO_DA_FOTO_BYTES) {
    throw new Conflict("FOTO_GRANDE", "A foto passa de 2 MB. Envie uma menor.");
  }

  const documentId = randomUUID();
  const key = resourceDocumentStorageKey("user", alvoUserId, documentId, ext);
  await putDocument(key, arquivo.bytes, arquivo.contentType);

  try {
    await db.transaction(async (tx) => {
      await tx.insert(resourceDocuments).values({
        id: documentId,
        entityType: "user",
        entityId: alvoUserId,
        docType: DOC_TYPE_FOTO,
        fileName: arquivo.nome,
        contentType: arquivo.contentType,
        sizeBytes: arquivo.bytes.byteLength,
        fileStorageKey: key,
        uploadedByUserId: autorUserId,
      });
      await writeAudit(tx, {
        entityType: "user",
        entityId: alvoUserId,
        action: "user.foto_alterada",
        previousValue: null,
        newValue: { documentId, fileName: arquivo.nome },
        actorUserId: autorUserId,
      });
    });
  } catch (e) {
    // O binário já subiu; sem a linha ele é lixo invisível. Melhor esforço, como no upload de frota.
    await removeObject(key, documentsBucket());
    throw e;
  }
}

/**
 * AS INICIAIS de quem não tem foto (FR-020).
 *
 * Nunca um ícone genérico igual para todos: numa lista de trinta linhas, trinta ícones idênticos não
 * distinguem ninguém — é o mesmo que não mostrar nada, ocupando espaço.
 *
 * Primeira e ÚLTIMA palavra, não as duas primeiras: "Anderson Paixão" e "Anderson Silva" viram AP e
 * AS. Pelas duas primeiras, "Maria Duda Ferreira" e "Maria Duda Souza" seriam as duas MD.
 */
export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0]![0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]![0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}
