import "server-only";
import { can, type PermissionKey, type Role } from "@brazil-tms/shared";
import { verifySession } from "./session";
import { isOnboardingIncomplete, type SessionUser, type UserStatus } from "./session-core";

/** Thrown when there is no valid/active session → HTTP 401. */
export class Unauthorized extends Error {
  readonly status = 401;
  constructor(message = "Não autenticado.") {
    super(message);
    this.name = "Unauthorized";
  }
}

/** Thrown when an authenticated user lacks the required permission → HTTP 403. */
export class Forbidden extends Error {
  readonly status = 403;
  constructor(message = "Acesso negado.") {
    super(message);
    this.name = "Forbidden";
  }
}

/**
 * Thrown when a signed-in user has not completed onboarding (must change password, or still
 * pending). They are restricted to the password flow; every other BFF route rejects them → 403.
 */
export class OnboardingRequired extends Error {
  readonly status = 403;
  readonly code = "PASSWORD_CHANGE_REQUIRED";
  constructor(message = "Conclua a definição de senha antes de continuar.") {
    super(message);
    this.name = "OnboardingRequired";
  }
}

export interface AuthContext {
  userId: string;
  /**
   * O papel antigo. **Não decide mais nada** — quem decide é `permissoes` (fatia 029). Continua aqui
   * porque a coluna continua existindo e algumas telas ainda o exibem.
   */
  role: Role;
  /** O que esta pessoa alcança, vindo do cargo dela. Vazio quando não há cargo. */
  permissoes: ReadonlySet<PermissionKey>;
  status: UserStatus;
  user: SessionUser;
}

/**
 * The single authentication gate for the BFF. Throws `Unauthorized` (401) if not signed in, and —
 * unless `allowIncompleteOnboarding` is set — `OnboardingRequired` (403) for a user who still must
 * change their password or is pending. Only `/api/auth/change-password` opts out, so incomplete
 * onboarding cannot reach any other protected route (the BFF is the security boundary, not the UI).
 */
export async function requireAuth(
  opts: { allowIncompleteOnboarding?: boolean } = {},
): Promise<AuthContext> {
  const result = await verifySession();
  if (!result.authenticated) throw new Unauthorized();
  const { user } = result;
  if (!opts.allowIncompleteOnboarding && isOnboardingIncomplete(user)) {
    throw new OnboardingRequired();
  }
  return {
    userId: user.id,
    role: user.role,
    permissoes: user.permissoes,
    status: user.status,
    user,
  };
}

/**
 * A ÚNICA porta de autorização do BFF — e os 169 pontos que a chamam não mudaram uma linha.
 *
 * Esta função já era o ponto de estrangulamento antes da fatia 029; o que mudou foi **de onde ela
 * lê**: de um `Record` em código para o cargo da pessoa, no banco. Quem decide continua sendo o BFF,
 * no mesmo lugar (princípio IV da constituição).
 *
 * `ctx` satisfaz `Principal` por ter `permissoes` — é por isso que a troca de assinatura do `can`
 * não tocou em nenhum destes 169 pontos, e tocou nos 62 que liam o papel direto.
 */
export function requirePermission(ctx: AuthContext, key: PermissionKey): void {
  if (!can(ctx, key)) throw new Forbidden();
}
