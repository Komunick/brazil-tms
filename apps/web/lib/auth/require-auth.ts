import "server-only";
import { can, type PermissionKey, type Role } from "@brazil-tms/shared";
import { verifySession } from "./session";
import type { SessionUser, UserStatus } from "./session-core";

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

export interface AuthContext {
  userId: string;
  role: Role;
  status: UserStatus;
  user: SessionUser;
}

/** The single authentication gate for the BFF. Throws `Unauthorized` (401) if not signed in. */
export async function requireAuth(): Promise<AuthContext> {
  const result = await verifySession();
  if (!result.authenticated) throw new Unauthorized();
  const { user } = result;
  return { userId: user.id, role: user.role, status: user.status, user };
}

/** Assert a permission on an already-resolved context. Throws `Forbidden` (403) if denied. */
export function requirePermission(ctx: AuthContext, key: PermissionKey): void {
  if (!can(ctx.role, key)) throw new Forbidden();
}
