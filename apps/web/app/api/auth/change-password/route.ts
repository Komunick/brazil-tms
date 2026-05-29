import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { changePasswordSchema } from "@brazil-tms/shared";
import { db, users } from "@brazil-tms/db";
import { requireAuth } from "@/lib/auth/require-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/change-password — set a new password for the signed-in user and clear the
 * must-change flag (FR-013a). Requires an active session. The Supabase `app_metadata` flag is a
 * best-effort mirror of the DB flag; failures there are ignored.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    const body = await request.json();
    const { newPassword } = changePasswordSchema.parse(body);

    const supabase = await createSupabaseServerClient();
    await supabase.auth.updateUser({ password: newPassword });

    await db
      .update(users)
      .set({ mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, ctx.userId));

    try {
      await createSupabaseAdminClient().auth.admin.updateUserById(ctx.userId, {
        app_metadata: { must_change_password: false },
      });
    } catch {
      // Best-effort metadata mirror; the authoritative flag lives in the DB.
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
