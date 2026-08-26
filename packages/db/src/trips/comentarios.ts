import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../client";
import { tripComments } from "../../schema";

/**
 * OS COMENTÁRIOS DE UMA VIAGEM — o recado que fica (2026-08-26, a pedido).
 *
 * São de todos: quem abre a LH lê o que já foi dito. O porquê de não serem `trip_events` nem
 * `alerts` está em `schema/trip-comments.ts`.
 */

export interface Comentario {
  id: string;
  tripId: string;
  texto: string;
  autorUserId: string;
  /** O nome de quem escreveu. `null` só se o usuário sumiu — o texto continua valendo. */
  autor: string | null;
  criadoEm: string;
}

/**
 * Do mais RECENTE para o mais antigo.
 *
 * Ao contrário de um chat, que se lê de cima para baixo: aqui a pergunta é "o que há de novo nesta
 * viagem", e a resposta tem de estar na primeira linha. Quem quer o histórico rola.
 */
export async function listarComentarios(tripId: string, limite = 100): Promise<Comentario[]> {
  const linhas = await db.execute<{
    id: string;
    trip_id: string;
    texto: string;
    autor_user_id: string;
    autor: string | null;
    criado_em: Date;
  }>(sql`
    select c.id, c.trip_id, c.texto, c.autor_user_id, u.name as autor, c.criado_em
      from trip_comments c
      left join users u on u.id = c.autor_user_id
     where c.trip_id = ${tripId} and c.apagado_em is null
     order by c.criado_em desc
     limit ${limite}
  `);
  return linhas.map((r) => ({
    id: r.id,
    tripId: r.trip_id,
    texto: r.texto,
    autorUserId: r.autor_user_id,
    autor: r.autor,
    criadoEm: new Date(r.criado_em).toISOString(),
  }));
}

export async function comentar(
  tripId: string,
  autorUserId: string,
  texto: string,
): Promise<Comentario> {
  const [linha] = await db
    .insert(tripComments)
    .values({ tripId, autorUserId, texto: texto.trim() })
    .returning();
  if (!linha) throw new Error("Comentário não gravado.");
  return {
    id: linha.id,
    tripId: linha.tripId,
    texto: linha.texto,
    autorUserId: linha.autorUserId,
    autor: null,
    criadoEm: linha.criadoEm.toISOString(),
  };
}

/**
 * APAGAR é do AUTOR, e a regra mora no `where`.
 *
 * Não é um `if` na rota: a condição de dono viaja junto com a operação, e não há caminho — rota
 * nova, job, script — que possa apagar o comentário de outra pessoa por esquecimento. Devolve
 * `false` quando não apagou, e quem chama não precisa saber se foi por não existir ou por não ser
 * dono: as duas respostas são a mesma para quem está do lado de fora.
 */
export async function apagarComentario(id: string, autorUserId: string): Promise<boolean> {
  const apagadas = await db
    .update(tripComments)
    .set({ apagadoEm: sql`now()` })
    .where(
      and(
        eq(tripComments.id, id),
        eq(tripComments.autorUserId, autorUserId),
        isNull(tripComments.apagadoEm),
      ),
    )
    .returning({ id: tripComments.id });
  return apagadas.length > 0;
}
