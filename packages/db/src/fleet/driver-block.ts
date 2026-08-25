import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "../client";
import { writeAudit } from "../audit/write-audit";
import { drivers, users } from "../../schema";

/**
 * BLOQUEAR E DESBLOQUEAR UM MOTORISTA (2026-08-25, a pedido).
 *
 * Tirar alguém de circulação: enquanto bloqueado, ele não é escalado em nenhuma viagem — nem pelo
 * formulário interno de escala, nem pelo diálogo que fala com o portal do cliente, que é o caminho
 * que a operação realmente usa.
 *
 * ── NÃO É O `status = 'blocked'` ──────────────────────────────────────────────────────────────
 *
 * Aquele significa "o portal do CLIENTE desativou ou suspendeu esta pessoa", e havia oito assim em
 * produção no dia em que isto foi escrito. Desfazer a decisão do cliente não é escolha nossa, e
 * misturar as duas faria o botão de desbloquear pôr de volta na estrada exatamente quem ele tirou.
 *
 * Ver o comentário dos campos em `schema/drivers.ts`.
 *
 * ── O MOTIVO É OBRIGATÓRIO ────────────────────────────────────────────────────────────────────
 *
 * E o CHECK do banco garante, não a boa intenção de quem chama. Um bloqueio mudo vira, semanas
 * depois, um nome parado que ninguém sabe por que está parado.
 */

export interface MotoristaBloqueado {
  id: string;
  name: string;
  phone: string | null;
  blockedAt: string;
  blockedReason: string;
  blockedByName: string | null;
}

/**
 * Bloqueia — e devolve `false` quando já estava bloqueado.
 *
 * O `where` exige `blocked_at is null`: sem isso, bloquear de novo sobrescreveria quem bloqueou e
 * por quê, apagando o motivo original justamente quando alguém for procurá-lo. Um segundo bloqueio
 * não é uma decisão nova; é a mesma decisão apertada duas vezes.
 */
export async function bloquearMotorista(entrada: {
  driverId: string;
  motivo: string;
  actorUserId: string;
}): Promise<boolean> {
  const motivo = entrada.motivo.trim();
  // A mesma regra do CHECK, verificada antes para a rota poder responder 400 em vez de 500. O banco
  // continua sendo a garantia — esta checagem é sobre a QUALIDADE do erro, não sobre a invariante.
  if (!motivo) return false;

  return db.transaction(async (tx) => {
    const r = await tx
      .update(drivers)
      .set({
        blockedAt: new Date(),
        blockedByUserId: entrada.actorUserId,
        blockedReason: motivo,
        updatedAt: new Date(),
      })
      .where(and(eq(drivers.id, entrada.driverId), isNull(drivers.blockedAt)))
      .returning({ id: drivers.id, name: drivers.name });

    const linha = r[0];
    if (!linha) return false;

    await writeAudit(tx, {
      actorUserId: entrada.actorUserId,
      action: "driver.block",
      entityType: "driver",
      entityId: linha.id,
      previousValue: { bloqueado: false },
      newValue: { bloqueado: true, nome: linha.name },
      // O motivo vai no campo próprio da auditoria, e não só na coluna do motorista: desbloquear
      // limpa a coluna, e sem isto a razão do bloqueio desapareceria junto.
      reason: motivo,
    });
    return true;
  });
}

/**
 * Desbloqueia — e devolve `false` quando não estava bloqueado.
 *
 * Limpa os três campos juntos, porque o CHECK os trata como conjunto. O motivo original não se
 * perde: ele ficou na auditoria do bloqueio.
 */
export async function desbloquearMotorista(entrada: {
  driverId: string;
  actorUserId: string;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const r = await tx
      .update(drivers)
      .set({
        blockedAt: null,
        blockedByUserId: null,
        blockedReason: null,
        updatedAt: new Date(),
      })
      .where(and(eq(drivers.id, entrada.driverId), isNotNull(drivers.blockedAt)))
      .returning({ id: drivers.id, name: drivers.name });

    const linha = r[0];
    if (!linha) return false;

    await writeAudit(tx, {
      actorUserId: entrada.actorUserId,
      action: "driver.unblock",
      entityType: "driver",
      entityId: linha.id,
      previousValue: { bloqueado: true },
      newValue: { bloqueado: false, nome: linha.name },
    });
    return true;
  });
}

/**
 * Os bloqueados POR NÓS — a aba.
 *
 * `blocked_at is not null` e nada sobre `status`: os que o portal do cliente desativou não entram
 * aqui, porque esta lista é a das decisões que se pode desfazer neste botão.
 *
 * O nome de quem bloqueou vem por LEFT JOIN, nunca INNER: um usuário removido não pode fazer o
 * bloqueio dele sumir da lista — some o nome, não a linha.
 */
export async function listarMotoristasBloqueados(): Promise<MotoristaBloqueado[]> {
  const linhas = await db
    .select({
      id: drivers.id,
      name: drivers.name,
      phone: drivers.phone,
      blockedAt: drivers.blockedAt,
      blockedReason: drivers.blockedReason,
      blockedByName: users.name,
    })
    .from(drivers)
    .leftJoin(users, eq(users.id, drivers.blockedByUserId))
    .where(and(isNotNull(drivers.blockedAt), isNull(drivers.archivedAt)))
    .orderBy(desc(drivers.blockedAt));

  return linhas.map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    blockedAt: l.blockedAt!.toISOString(),
    blockedReason: l.blockedReason ?? "",
    blockedByName: l.blockedByName,
  }));
}

/**
 * OS BLOQUEADOS, por id do portal — é o que a lista de atribuição precisa saber.
 *
 * A atribuição pelo portal conhece as pessoas pelo id DELE, não pelo nosso. Devolver um mapa evita
 * uma consulta por motorista numa lista de centenas.
 */
export async function bloqueiosPorIdDoPortal(): Promise<Map<number, string>> {
  const linhas = await db
    .select({ portalDriverId: drivers.portalDriverId, motivo: drivers.blockedReason })
    .from(drivers)
    .where(and(isNotNull(drivers.blockedAt), isNotNull(drivers.portalDriverId)));

  const mapa = new Map<number, string>();
  for (const l of linhas) {
    const id = Number(l.portalDriverId);
    if (Number.isFinite(id) && id > 0) mapa.set(id, l.motivo ?? "");
  }
  return mapa;
}

/**
 * ESTÁ BLOQUEADO? — a pergunta que a rota de atribuição faz antes de enfileirar a ordem.
 *
 * Por id do PORTAL, porque é o que o diálogo manda. Devolve o nome junto: a mensagem de recusa
 * precisa dizer QUEM está bloqueado, e numa atribuição com dois motoristas "um deles está
 * bloqueado" mandaria a pessoa adivinhar qual.
 */
export async function motoristasBloqueadosEntre(
  portalDriverIds: readonly (string | number | null | undefined)[],
): Promise<{ name: string; motivo: string }[]> {
  const ids = portalDriverIds
    .map((v) => (v == null ? null : String(v).trim()))
    .filter((v): v is string => !!v);
  if (ids.length === 0) return [];

  const linhas = await db
    .select({ name: drivers.name, motivo: drivers.blockedReason })
    .from(drivers)
    .where(
      and(
        isNotNull(drivers.blockedAt),
        // `inArray` e não o template `sql` — ver o comentário em `portal-commands.ts`.
        inArray(drivers.portalDriverId, ids),
      ),
    );

  return linhas.map((l) => ({ name: l.name, motivo: l.motivo ?? "" }));
}
