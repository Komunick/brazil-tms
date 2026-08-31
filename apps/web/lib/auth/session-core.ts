import { SEM_CAPACIDADES, type PermissionKey, type Role } from "@brazil-tms/shared";

export type UserStatus = "pending" | "active" | "disabled";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  /**
   * O papel ANTIGO. Continua aqui porque a coluna continua existindo e alguma tela ainda o exibe —
   * mas **ele não decide mais nada**. Quem decide é `permissoes`, e é isso que `can` recebe.
   *
   * A remoção é assunto de uma fatia futura, depois de a produção ter rodado no cargo.
   */
  role: Role;
  /**
   * O QUE ESTA PESSOA ALCANÇA — vindo do cargo dela, lido a cada requisição (fatia 029).
   *
   * **Vazio quando não há cargo, e NUNCA o papel antigo.** Ver `evaluateProfile` para o porquê.
   */
  permissoes: ReadonlySet<PermissionKey>;
  /** O nome do cargo, para a tela poder dizer "sem cargo definido" em vez de só não mostrar nada. */
  cargo: string | null;
  status: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
}

/** A loaded `public.users` row, decoupled from Drizzle's inferred type for pure testing. */
export interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  /** As capacidades do cargo, resolvidas no MESMO `select` da sessão — sem consulta a mais. */
  permissoes: readonly string[];
  cargo: string | null;
}

export type SessionResult =
  | { authenticated: true; user: SessionUser }
  | { authenticated: false; reason: "no_session" | "no_profile" | "disabled" };

export function toUserStatus(status: string): UserStatus {
  return status === "active" || status === "disabled" || status === "pending" ? status : "disabled";
}

/**
 * Pure session decision from the GoTrue auth id + the loaded profile. Role/status are read fresh
 * from Postgres each request, so disables and role changes take effect on the next request
 * (SC-007, spec edge cases). A `disabled` profile is rejected immediately.
 */
export function evaluateProfile(
  authUserId: string | null,
  profile: ProfileRow | null,
): SessionResult {
  if (!authUserId) return { authenticated: false, reason: "no_session" };
  if (!profile) return { authenticated: false, reason: "no_profile" };
  const status = toUserStatus(profile.status);
  if (status === "disabled") return { authenticated: false, reason: "disabled" };
  return {
    authenticated: true,
    user: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      /**
       * SEM CARGO ⇒ CONJUNTO VAZIO. Nunca `ROLE_PERMISSIONS[profile.role]`.
       *
       * A tentação do fallback é grande e é errada: se a leitura do cargo quebrar — um `join` mal
       * escrito, uma tabela vazia, uma migração que não subiu —, cair no papel antigo faria TUDO
       * continuar funcionando. Ninguém descobriria que a autorização voltou a ser a de código, até
       * alguém editar um cargo e nada acontecer.
       *
       * Vazio é barulhento: a pessoa entra, não vê nada, e a tela diz "sem cargo definido". Um
       * defeito que aparece em minutos vale mais que um que dorme por meses.
       *
       * Vazio também é o lado CERTO de errar num modelo de autorização: o outro lado é conceder o
       * que ninguém pediu.
       */
      permissoes:
        profile.permissoes.length > 0
          ? new Set(profile.permissoes as PermissionKey[])
          : SEM_CAPACIDADES,
      cargo: profile.cargo,
      status,
      mustChangePassword: profile.mustChangePassword,
      lastLoginAt: profile.lastLoginAt,
    },
  };
}

/**
 * Onboarding is incomplete while a user must change their password (temp-password path) or is
 * still `pending` (invited, not yet onboarded). Such a user is restricted to the password flow —
 * enforced in BOTH the shell (decideAccess) and the BFF (requireAuth).
 */
export function isOnboardingIncomplete(user: SessionUser): boolean {
  return user.mustChangePassword || user.status === "pending";
}

/** The password flow the BFF forces an onboarding-incomplete user into (FR-013a). */
export const SET_PASSWORD_PATH = "/auth/set-password";

/**
 * Where to send the browser after a successful sign-in. The server's target wins whenever it is the
 * forced password flow — a `?redirectTo=` left over from the middleware's login bounce must NEVER
 * skip the forced change. Otherwise honour the requested path, restricted to same-origin absolute
 * paths (`//evil.com` and `https://…` are rejected as open redirects).
 */
export function resolvePostLoginTarget(requested: string | null, serverTarget: string): string {
  if (serverTarget === SET_PASSWORD_PATH) return serverTarget;
  if (requested && requested.startsWith("/") && !requested.startsWith("//")) return requested;
  return serverTarget;
}

export type AccessDecision = "allow" | "redirect_login" | "redirect_set_password";

/**
 * Where an authenticated-area request should go. A user who must change their password OR who is
 * still `pending` (invited but not yet onboarded) is restricted to the password flow until they
 * complete it (FR-013a; data-model: "pending cannot use the app except the set-password flow").
 */
export function decideAccess(
  session: SessionResult,
  opts: { isPasswordFlowRoute?: boolean } = {},
): AccessDecision {
  if (!session.authenticated) return "redirect_login";
  if (isOnboardingIncomplete(session.user) && !opts.isPasswordFlowRoute) {
    return "redirect_set_password";
  }
  return "allow";
}
