import { eq } from "drizzle-orm";
import { db } from "../client";
import { users } from "../../schema";

/**
 * QUEM o robô é, quando escreve no TMS.
 *
 * Uma conta de serviço, configurada por e-mail em vez de codificada, para que todo evento e toda
 * linha de auditoria escritos pelo portal nomeiem um usuário real e revogável — e para que ninguém
 * precise se perguntar, meses depois, qual humano "fez" quinhentas mudanças de status às três da
 * manhã.
 *
 * Mora aqui, e não só no BFF, porque a varredura de retiradas roda no WORKER e cancela viagem: se
 * cada lado escolhesse seu próprio ator, o histórico de uma mesma viagem teria dois autores para o
 * mesmo robô. O BFF continua tendo a versão dele, que traduz a falha em erro de HTTP — o que ele não
 * tem mais é uma segunda definição de quem é o robô.
 */
export async function resolvePortalActorId(): Promise<string> {
  const email = process.env.PORTAL_FEED_ACTOR_EMAIL;
  if (!email) {
    throw new Error(
      "PORTAL_FEED_ACTOR_EMAIL não configurado: o robô precisa de um usuário de serviço.",
    );
  }
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  const id = rows[0]?.id;
  if (!id) throw new Error(`Usuário de serviço ${email} não existe.`);
  return id;
}
