import "server-only";
import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { cargos, db, users } from "@brazil-tms/db";
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
      cargo: cargos.nome,
      permissoes: sql<string[]>`coalesce(
        (select array_agg(cp.permissao) from cargo_permissoes cp where cp.cargo_id = ${users.cargoId}),
        '{}'
      )`.as("permissoes"),
    })
    .from(users)
    .leftJoin(cargos, eq(cargos.id, users.cargoId))
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
