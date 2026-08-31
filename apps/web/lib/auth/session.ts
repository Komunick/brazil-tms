import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { db } from "@brazil-tms/db";
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
  const rows = await db.execute<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    must_change_password: boolean;
    last_login_at: Date | null;
    cargo: string | null;
    permissoes: string[];
  }>(sql`
    select u.id, u.name, u.email, u.role::text as role, u.status,
           u.must_change_password, u.last_login_at,
           c.nome as cargo,
           coalesce(
             (select array_agg(cp.permissao)
                from cargo_permissoes cp
               where cp.cargo_id = u.cargo_id),
             '{}'
           ) as permissoes
      from users u
      left join cargos c on c.id = u.cargo_id
     where u.id = ${authUserId}
     limit 1
  `);
  const row = rows[0];
  const profile: ProfileRow | null = row
    ? {
        id: row.id,
        name: row.name,
        email: row.email,
        // customer_viewer is non-assignable (FR-007); a stored role is always one of the 7.
        role: row.role as Role,
        status: row.status,
        mustChangePassword: row.must_change_password,
        lastLoginAt: row.last_login_at,
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
