import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db, users } from "../src";

/**
 * The account the portal robot acts as (2026-08-16).
 *
 * Every trip event and audit row the feed writes names a user, and it must not be a person's: nobody
 * should have to wonder later which human moved 500 trips at 3am, and revoking a machine's access
 * must not mean disabling somebody's login.
 *
 * Two deliberate properties:
 *   - **It cannot log in.** Status `disabled` blocks the sign-in path, while the row stays a perfectly
 *     valid actor for audit and events. A service account that could log in would be a password
 *     sitting in a script somewhere.
 *   - **Its password is random and thrown away.** Nothing reads it; GoTrue needs one to exist.
 *
 * Idempotent. Run after `db:migrate`:
 *   pnpm --filter @brazil-tms/db db:seed:service-account
 * Then point the app at it: PORTAL_FEED_ACTOR_EMAIL=<the e-mail below>.
 */

const EMAIL = process.env.PORTAL_FEED_ACTOR_EMAIL ?? "robo-portal@braziltransports.com.br";
const NAME = "Robô do portal";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.",
  );
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function authUserId(email: string): Promise<string> {
  const created = await admin.auth.admin.createUser({
    email,
    // Nobody keeps this: the account is disabled, and no path reads a service account's password.
    password: randomBytes(24).toString("base64url"),
    email_confirm: true,
  });
  if (created.data?.user) return created.data.user.id;

  for (let page = 1; page <= 20; page += 1) {
    const list = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const found = list.data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if ((list.data?.users.length ?? 0) < 200) break;
  }
  throw new Error(`Não consegui criar nem encontrar o usuário ${email}.`);
}

async function main(): Promise<void> {
  const id = await authUserId(EMAIL);

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  if (existing[0]) {
    await db
      .update(users)
      .set({ name: NAME, status: "disabled", mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, id));
  } else {
    await db.insert(users).values({
      id,
      email: EMAIL,
      name: NAME,
      // The least-privileged role there is; it is never exercised, since the account cannot log in.
      role: "dispatcher",
      status: "disabled",
      mustChangePassword: false,
    });
  }

  console.log(
    `Usuário de serviço pronto: ${EMAIL} (não consegue entrar; só assina o que o robô faz)`,
  );
  console.log(`Configure no servidor: PORTAL_FEED_ACTOR_EMAIL=${EMAIL}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
