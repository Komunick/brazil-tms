import "server-only";
import { and, desc, eq, ilike, ne, or } from "drizzle-orm";
import { db, users } from "@brazil-tms/db";
import type { CreateUserInput, Role, Setor, UpdateUserInput } from "@brazil-tms/shared";
import { setorValido } from "@brazil-tms/shared";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit/write-audit";
import { Conflict, NotFound } from "@/lib/api/respond";

/** API response shape for a user profile (timestamps as ISO strings). */
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  /** O setor da passagem de turno. Nulo é o normal — a maioria das contas não faz turno. */
  setor: Setor | null;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A loaded `public.users` row (Drizzle-inferred shape we care about). */
interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  setor: string | null;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Map a DB row to the API profile shape. `customer_viewer` is never stored (FR-007). */
function toProfile(row: UserRow): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as Role,
    status: row.status,
    setor: setorValido(row.setor),
    mustChangePassword: row.mustChangePassword,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Postgres unique-violation SQLSTATE. */
const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}

export interface ListUsersOptions {
  search?: string;
  status?: string;
  role?: Role;
}

/** List users, optionally filtered, ordered by creation time (newest first). */
export async function listUsers(opts: ListUsersOptions = {}): Promise<UserProfile[]> {
  const filters = [];
  if (opts.search && opts.search.trim().length > 0) {
    const term = `%${opts.search.trim()}%`;
    filters.push(or(ilike(users.name, term), ilike(users.email, term)));
  }
  if (opts.status) filters.push(eq(users.status, opts.status));
  if (opts.role) filters.push(eq(users.role, opts.role));

  const rows = await db
    .select()
    .from(users)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(users.createdAt));

  return rows.map(toProfile);
}

/**
 * Create a user (FR-013, FR-013a). GoTrue-first: the auth user is provisioned, then the profile
 * row + audit entries are written in one transaction. If the transaction fails the GoTrue user is
 * compensatingly deleted so we never leak an orphaned auth identity.
 */
export async function createUser(
  input: CreateUserInput,
  actorUserId: string,
  redirectTo: string,
): Promise<UserProfile> {
  const { name, email, role, onboarding } = input;

  // Pre-check duplicate email before touching GoTrue (avoids an orphaned auth user).
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    throw new Conflict("DUPLICATE_EMAIL", "Já existe um usuário com esse e-mail.");
  }

  const admin = createSupabaseAdminClient();
  const invite = onboarding.method === "invite";

  let authUserId: string;
  if (invite) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { name },
    });
    if (error || !data.user) {
      throw new Error(`Falha ao convidar usuário: ${error?.message ?? "sem id"}`);
    }
    authUserId = data.user.id;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: onboarding.tempPassword,
      email_confirm: true,
      user_metadata: { name },
      app_metadata: { must_change_password: true },
    });
    if (error || !data.user) {
      throw new Error(`Falha ao criar usuário: ${error?.message ?? "sem id"}`);
    }
    authUserId = data.user.id;
  }

  const status = invite ? "pending" : "active";
  const mustChangePassword = !invite;

  try {
    const profile = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(users)
        .values({ id: authUserId, name, email, role, status, mustChangePassword })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("Inserção de usuário não retornou linha.");

      await writeAudit(tx, {
        entityType: "user",
        entityId: authUserId,
        action: "user.create",
        previousValue: null,
        newValue: { name, email, role, status },
        actorUserId,
      });

      if (invite) {
        await writeAudit(tx, {
          entityType: "user",
          entityId: authUserId,
          action: "user.invite_sent",
          previousValue: null,
          newValue: { email },
          actorUserId,
        });
      }

      return toProfile(row);
    });

    return profile;
  } catch (error) {
    // Compensate: the auth user exists but the profile failed — delete it best-effort.
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch (cleanupError) {
      console.error("Failed to compensate orphaned auth user:", authUserId, cleanupError);
    }
    if (isUniqueViolation(error)) {
      throw new Conflict("DUPLICATE_EMAIL", "Já existe um usuário com esse e-mail.");
    }
    throw error;
  }
}

/**
 * Update a user's role and/or status (FR-014, FR-015, FR-016). The last-admin guard runs inside
 * the transaction (FOR UPDATE) so disabling/down-roling the final active admin is rejected before
 * any write. GoTrue ban state is synced best-effort after the commit.
 */
export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actorUserId: string,
): Promise<UserProfile> {
  const currentRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const current = currentRows[0];
  if (!current) throw new NotFound("NOT_FOUND", "Usuário não encontrado.");

  const nextRole = input.role ?? (current.role as Role);
  const nextStatus = input.status ?? current.status;

  const roleChanged = input.role !== undefined && input.role !== current.role;
  const statusChanged = input.status !== undefined && input.status !== current.status;
  /**
   * O SETOR NÃO ENTRA NA GUARDA DO ÚLTIMO ADMINISTRADOR, de propósito.
   *
   * Aquela guarda existe para impedir que o sistema fique sem ninguém capaz de administrá-lo. Setor
   * não administra nada — tirar o setor de alguém não fecha porta nenhuma além da faixa do diário.
   * Enfiá-lo ali só tornaria a guarda mais difícil de entender sem proteger mais nada.
   */
  const nextSetor = input.setor !== undefined ? input.setor : (current.setor ?? null);
  const setorChanged = input.setor !== undefined && input.setor !== (current.setor ?? null);

  // Does this change remove the last active admin? (disabling an admin, or moving an admin off admin)
  const removesAdmin =
    current.role === "admin" &&
    current.status === "active" &&
    ((statusChanged && nextStatus === "disabled") || (roleChanged && nextRole !== "admin"));

  const profile = await db.transaction(async (tx) => {
    if (removesAdmin) {
      // Lock the OTHER active-admin rows and count them in code. Postgres rejects FOR UPDATE on an
      // aggregate query, so we must select rows (not count()) here.
      const otherActiveAdmins = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.status, "active"), ne(users.id, id)))
        .for("update");
      if (otherActiveAdmins.length === 0) {
        throw new Conflict(
          "LAST_ADMIN_GUARD",
          "Não é possível desativar ou rebaixar o último administrador ativo.",
        );
      }
    }

    const updated = await tx
      .update(users)
      .set({ role: nextRole, status: nextStatus, setor: nextSetor, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    const row = updated[0];
    if (!row) throw new NotFound("NOT_FOUND", "Usuário não encontrado.");

    if (roleChanged) {
      await writeAudit(tx, {
        entityType: "user",
        entityId: id,
        action: "user.role_change",
        previousValue: { role: current.role },
        newValue: { role: nextRole },
        actorUserId,
        reason: input.reason ?? null,
      });
    }

    /**
     * A troca de setor é AUDITADA como as outras duas.
     *
     * Ela decide quem pode escrever no diário de turno, e o diário é o registro que alguém lê de
     * madrugada para decidir o que fazer. "Quem passou a poder escrever nisto, e quando" é
     * exatamente o tipo de pergunta que a auditoria existe para responder.
     */
    if (setorChanged) {
      await writeAudit(tx, {
        entityType: "user",
        entityId: id,
        action: "user.setor_change",
        previousValue: { setor: current.setor ?? null },
        newValue: { setor: nextSetor },
        actorUserId,
        reason: input.reason ?? null,
      });
    }

    if (statusChanged) {
      await writeAudit(tx, {
        entityType: "user",
        entityId: id,
        action: "user.status_change",
        previousValue: { status: current.status },
        newValue: { status: nextStatus },
        actorUserId,
        reason: input.reason ?? null,
      });
    }

    return toProfile(row);
  });

  // Sync GoTrue ban state (best-effort; the DB status is authoritative for our session check).
  if (statusChanged) {
    try {
      const admin = createSupabaseAdminClient();
      await admin.auth.admin.updateUserById(id, {
        ban_duration: nextStatus === "disabled" ? "876600h" : "none",
      });
    } catch (banError) {
      console.error("Failed to sync GoTrue ban state for user:", id, banError);
    }
  }

  return profile;
}

/** Postgres foreign-key-violation SQLSTATE — a user still referenced by operational history. */
const PG_FK_VIOLATION = "23503";

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === PG_FK_VIOLATION
  );
}

/**
 * Delete a user outright — the `public.users` profile AND the GoTrue identity behind it.
 *
 * Only for cadastros that never acted (a mistyped invite, a wrong e-mail). Constitution III forbids
 * hard-deleting auditable records, and every history table (audit_logs, trip_events, documents,
 * assignments…) references `users.id` with the default RESTRICT — so the profile DELETE simply
 * fails with 23503 for anyone with history, which we surface as `409 USER_HAS_HISTORY` pointing at
 * "Desativar". Deleting yourself or the last active admin is refused up front.
 *
 * Order matters: the profile row goes first (inside the tx, so the FK guard runs and the audit row
 * is written atomically), and only after the commit is the auth identity removed — the reverse
 * would destroy the login of a user we then discover we must keep.
 */
export async function deleteUser(id: string, actorUserId: string): Promise<void> {
  const currentRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const current = currentRows[0];
  if (!current) throw new NotFound("NOT_FOUND", "Usuário não encontrado.");

  if (id === actorUserId) {
    throw new Conflict("SELF_DELETE", "Você não pode excluir o próprio usuário.");
  }

  try {
    await db.transaction(async (tx) => {
      if (current.role === "admin" && current.status === "active") {
        const otherActiveAdmins = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, "admin"), eq(users.status, "active"), ne(users.id, id)))
          .for("update");
        if (otherActiveAdmins.length === 0) {
          throw new Conflict(
            "LAST_ADMIN_GUARD",
            "Não é possível excluir o último administrador ativo.",
          );
        }
      }

      await tx.delete(users).where(eq(users.id, id));

      // `entity_id` is a plain uuid (no FK), so this row outlives the profile it describes.
      await writeAudit(tx, {
        entityType: "user",
        entityId: id,
        action: "user.delete",
        previousValue: {
          name: current.name,
          email: current.email,
          role: current.role,
          status: current.status,
        },
        newValue: null,
        actorUserId,
      });
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new Conflict(
        "USER_HAS_HISTORY",
        "Este usuário já possui histórico no sistema. Desative-o em vez de excluir.",
      );
    }
    throw error;
  }

  // Profile gone: drop the login too. Best-effort — a leftover auth identity cannot sign in, since
  // the session check resolves the profile row that no longer exists.
  try {
    const admin = createSupabaseAdminClient();
    await admin.auth.admin.deleteUser(id);
  } catch (authError) {
    console.error("Failed to delete GoTrue identity for user:", id, authError);
  }
}

/** Re-send the invite email for a still-pending user (FR-013). */
export async function resendInvite(
  id: string,
  actorUserId: string,
  redirectTo: string,
): Promise<void> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new NotFound("NOT_FOUND", "Usuário não encontrado.");
  if (row.status !== "pending") {
    throw new Conflict("NOT_PENDING", "O usuário não está pendente.");
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(row.email, {
    redirectTo,
    data: { name: row.name },
  });
  if (error) throw new Error(`Falha ao reenviar convite: ${error.message}`);

  await db.transaction(async (tx) => {
    await writeAudit(tx, {
      entityType: "user",
      entityId: id,
      action: "user.invite_sent",
      previousValue: null,
      newValue: { email: row.email },
      actorUserId,
    });
  });
}

/** Build the invite/reset redirect target from the request origin. */
export function inviteRedirectTo(request: Request): string {
  const origin =
    request.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    new URL(request.url).origin;
  return `${origin}/auth/set-password`;
}
