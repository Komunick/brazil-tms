import { eq } from "drizzle-orm";
import { db } from "./client";
import { users } from "../schema";

/**
 * QUEM subiu a foto, quando quem manda é o próprio motorista (fatia 028).
 *
 * `resource_documents.uploaded_by_user_id` é `NOT NULL` com chave estrangeira para `users`, e isso
 * é de propósito: a tabela foi desenhada para atos de gente do escritório. O formulário público não
 * tem gente do escritório — tem um motorista num estande, sem conta nenhuma no TMS.
 *
 * A resposta honesta não é afrouxar a coluna, que abriria a porta para documento sem dono em todo o
 * sistema. É dizer quem foi: um usuário de serviço real e revogável, que aparece no histórico com
 * nome em vez de um vazio.
 *
 * ── POR QUE UMA CONTA SEPARADA DA DO ROBÔ ─────────────────────────────────────────────────────
 *
 * `resolvePortalActorId` resolve o mesmo problema para o robô do portal, e a tentação é reusá-la.
 * São portas muito diferentes: uma é um robô autenticado lendo o portal do cliente, a outra é uma
 * rota ABERTA na internet. Se um dia for preciso revogar a porta pública às pressas, isso não pode
 * derrubar a leitura do portal junto.
 *
 * Duas contas, e nenhum auxiliar genérico entre elas: são dois casos, e a regra do ≥3 deste
 * repositório existe justamente para que a terceira ocorrência é que crie a abstração.
 *
 * Configurado por E-MAIL e não por id — o id muda entre ambientes, o e-mail não. E resolvido a cada
 * chamada em vez de guardado em memória, para que revogar a conta valha no próximo uso e não no
 * próximo deploy.
 */
export async function resolvePreCadastroActorId(): Promise<string> {
  const email = process.env.PRE_CADASTRO_ACTOR_EMAIL;
  if (!email) {
    throw new Error(
      "PRE_CADASTRO_ACTOR_EMAIL não configurado: o formulário público precisa de um usuário de serviço.",
    );
  }
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  const id = rows[0]?.id;
  if (!id) throw new Error(`Usuário de serviço ${email} não existe.`);
  return id;
}
