import "server-only";
import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db, users } from "@brazil-tms/db";
import type { Role } from "@brazil-tms/shared";
import { createSupabaseServerClient } from "../supabase/server";
import { evaluateProfile, type ProfileRow, type SessionResult } from "./session-core";

async function loadSession(): Promise<SessionResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  const authUserId = error || !data.user ? null : data.user.id;
  if (!authUserId) return evaluateProfile(null, null);

  /**
   * O CARGO ENTRA NO MESMO `select` — nenhuma ida a mais ao banco (fatia 029).
   *
   * A sessão já fazia uma consulta por requisição, e é ela que faz a mudança de cargo valer sem a
   * pessoa sair e entrar: o papel nunca veio de um token assinado. Acrescentar as capacidades por
   * `join` mantém o custo em uma consulta.
   *
   * `array_agg` com `left join` e `coalesce`: quem não tem cargo, ou tem um cargo sem nada marcado,
   * volta com lista vazia — e é `evaluateProfile` que decide o que isso significa (nada, nunca o
   * papel antigo).
   */
  /**
   * CONSTRUÍDO PELO `select` DO DRIZZLE, e **não** por `db.execute` com SQL cru.
   *
   * A primeira versão usava `db.execute`, e a prova contra o banco do dev pegou o defeito: ali as
   * colunas voltam **cruas**, sem a conversão de tipo do drizzle. `last_login_at` chegava como
   * STRING (`"2026-08-29 19:52:24.43+00"`) numa propriedade tipada `Date | null` — o TypeScript
   * concordava e o `instanceof Date` era `false`.
   *
   * É o pior formato de defeito de novo: nada quebra na hora, e quebra no primeiro `.toISOString()`
   * de quem confiar no tipo (é o que `lib/users/service.ts` faz com a mesma coluna). E ele só
   * apareceria com alguém LOGADO — sem sessão, esta função nem chega aqui.
   *
   * Com o `select` do drizzle, quem mapeia é ele: a coluna volta `Date`, como sempre foi.
   *
   * O único trecho cru é o `array_agg`, que não tem equivalente no construtor — e ele devolve
   * `text[]`, que não sofre conversão nenhuma.
   */
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      /**
       * OS CARGOS DA PESSOA, e as capacidades como UNIÃO deles (2026-09-01).
       *
       * Era um cargo só, lido por `users.cargo_id`. Uma pessoa do setor GR que também cuida do spot
       * não cabia nesse modelo: dar-lhe o SPOT tirava a GR — e foi exatamente para poder ter as
       * duas funções que os cargos foram criados.
       *
       * `distinct` na união porque a mesma capacidade pode vir de dois cargos, e a sessão precisa de
       * um CONJUNTO. Sem ele, `manage_users` viria duas vezes para quem tem dois cargos que a têm.
       *
       * CARGO DESATIVADO NÃO CONCEDE, e a trava é o `and c.ativo` aqui — não a tela. Desativar um
       * cargo tem de tirar o acesso de quem o tem, inclusive de quem já está com a sessão aberta.
       */
      cargo: sql<string | null>`(
        select string_agg(c.nome, ', ' order by c.nome)
          from usuario_cargos uc join cargos c on c.id = uc.cargo_id and c.ativo
         where uc.user_id = ${users.id}
      )`.as("cargo"),
      permissoes: sql<string[]>`coalesce((
        select array_agg(distinct cp.permissao)
          from usuario_cargos uc
          join cargos c on c.id = uc.cargo_id and c.ativo
          join cargo_permissoes cp on cp.cargo_id = uc.cargo_id
         where uc.user_id = ${users.id}
      ), '{}')`.as("permissoes"),
    })
    .from(users)
    .where(eq(users.id, authUserId))
    .limit(1);
  const row = rows[0];
  const profile: ProfileRow | null = row
    ? {
        id: row.id,
        name: row.name,
        email: row.email,
        // customer_viewer is non-assignable (FR-007); a stored role is always one of the 7.
        role: row.role as Role,
        status: row.status,
        mustChangePassword: row.mustChangePassword,
        lastLoginAt: row.lastLoginAt,
        permissoes: row.permissoes ?? [],
        cargo: row.cargo,
      }
    : null;

  return evaluateProfile(authUserId, profile);
}

/**
 * Authoritative per-request session, wrapped in React `cache()` so repeated calls within one
 * request hit GoTrue + Postgres only once (research §1). Authentication only — permission
 * assertions live in `require-auth.ts`.
 */
export const verifySession = cache(loadSession);

export * from "./session-core";
