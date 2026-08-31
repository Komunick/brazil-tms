import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import { selos, usuarioSelos } from "../../schema";
import { writeAudit } from "../audit/write-audit";

/**
 * OS SELOS — reconhecimento, e NUNCA acesso (fatia 029, US3).
 *
 * "Beta tester", "Líder", "Supervisor". Aparecem no mini perfil e ao lado do nome, com cor.
 *
 * ── ELES NÃO CONCEDEM NADA, E ISSO É ESTRUTURAL ───────────────────────────────────────────────
 *
 * O pedido citava o Discord, onde vários cargos SOMAM permissões. Foi decidido contra, e o motivo é
 * a pergunta que se faz depois de um incidente: *"por que fulano conseguia cancelar?"*. Com soma, a
 * resposta exige juntar três cargos e conferir a união. Com um cargo só, é uma linha.
 *
 * A separação é FÍSICA: nada neste arquivo escreve em `cargo_permissoes` nem em `users.cargo_id`.
 * Não existe caminho de selo até capacidade — ninguém precisa confiar na disciplina de quem escrever
 * o código depois.
 */

export interface Selo {
  id: string;
  nome: string;
  cor: string;
  /** Quantas pessoas têm este selo — a tela mostra antes de deixar apagar. */
  pessoas: number;
}

export async function listarSelos(): Promise<Selo[]> {
  const linhas = await db.execute<{ id: string; nome: string; cor: string; pessoas: number }>(sql`
    select s.id, s.nome, s.cor,
           (select count(*)::int from usuario_selos us where us.selo_id = s.id) as pessoas
      from selos s order by s.nome
  `);
  return linhas;
}

export async function criarSelo(nome: string, cor: string, autorId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [linha] = await tx.insert(selos).values({ nome, cor }).returning({ id: selos.id });
    const id = linha!.id;
    await writeAudit(tx, {
      entityType: "selo",
      entityId: id,
      action: "selo.criado",
      previousValue: null,
      newValue: { nome, cor },
      actorUserId: autorId,
    });
    return id;
  });
}

/** Apaga o selo — e ele SOME de quem o tinha, pelo `on delete cascade`. */
export async function apagarSelo(seloId: string, autorId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [antes] = await tx
      .select({ nome: selos.nome, cor: selos.cor })
      .from(selos)
      .where(eq(selos.id, seloId))
      .limit(1);
    if (!antes) return;
    /*
      APAGA DE VERDADE, e é a exceção deliberada ao princípio III nesta fatia.

      Um selo é rótulo, não fato: "Beta tester" não descreve nada que aconteceu, e guardar o
      histórico de quem já foi beta tester não responde pergunta nenhuma. Cargo se desativa porque o
      histórico dele explica acesso passado; selo não explica acesso nenhum — por construção.
    */
    await tx.delete(selos).where(eq(selos.id, seloId));
    await writeAudit(tx, {
      entityType: "selo",
      entityId: seloId,
      action: "selo.apagado",
      previousValue: antes,
      newValue: null,
      actorUserId: autorId,
    });
  });
}

/**
 * Grava os selos de uma pessoa — ESTADO FINAL, como o resto do sistema.
 *
 * A auditoria guarda a lista inteira antes e depois. Aqui isso importa menos que nos cargos (selo
 * não concede nada), mas a forma é a mesma para quem lê o registro não precisar aprender duas.
 */
export async function gravarSelosDaPessoa(
  userId: string,
  seloIds: string[],
  autorId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const antes = await tx
      .select({ seloId: usuarioSelos.seloId })
      .from(usuarioSelos)
      .where(eq(usuarioSelos.userId, userId));

    await tx.delete(usuarioSelos).where(eq(usuarioSelos.userId, userId));
    if (seloIds.length > 0) {
      await tx
        .insert(usuarioSelos)
        .values(seloIds.map((seloId) => ({ userId, seloId, aplicadoPor: autorId })));
    }

    await writeAudit(tx, {
      entityType: "user",
      entityId: userId,
      action: "usuario.selos_alterados",
      previousValue: { selos: antes.map((a) => a.seloId) },
      newValue: { selos: seloIds },
      actorUserId: autorId,
    });
  });
}
