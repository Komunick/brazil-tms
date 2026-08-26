import { NextResponse } from "next/server";
import { z } from "zod";
import { bloquearMotorista, desbloquearMotorista } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { Conflict, handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * BLOQUEAR E DESBLOQUEAR UM MOTORISTA (2026-08-25, a pedido).
 *
 * Enquanto bloqueado ele não é escalado em viagem nenhuma. A garantia não está aqui — está em
 * `enfileirarOrdemDoPortal`, dentro da transação que trava a viagem, e no avaliador de
 * elegibilidade do formulário interno. Esta rota só registra a decisão.
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `manage_fleet_data`, a mesma chave de mexer no cadastro do motorista. Não é `assign_resources`:
 * quem escala USA esta decisão, não a toma — senão a pessoa impedida de escalar alguém poderia
 * simplesmente desbloqueá-lo.
 *
 * ── O MOTIVO É OBRIGATÓRIO ────────────────────────────────────────────────────────────────────
 *
 * Decisão do usuário, e o CHECK do banco é quem garante. Um bloqueio mudo vira, semanas depois, um
 * nome parado que ninguém sabe por que está parado — e aí ou alguém desbloqueia no escuro, ou o
 * motorista fica parado para sempre.
 */
const corpo = z.object({
  motivo: z.string().trim().min(3, "O motivo precisa dizer alguma coisa."),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_fleet_data");
    const { id } = await params;

    // Um Zod que falha vira 400 VALIDATION em `handleRouteError` — o motivo em branco é recusado
    // aqui antes de o CHECK do banco o recusar, para a tela receber um erro que ela sabe mostrar.
    const body = corpo.parse(await request.json().catch(() => ({})));

    const mudou = await bloquearMotorista({
      driverId: id,
      motivo: body.motivo,
      actorUserId: ctx.userId,
    });

    // `false` não é erro: é bloquear quem já estava bloqueado. Dizer isso em vez de fingir sucesso
    // evita sobrescrever o motivo original — que é justamente o que alguém vai procurar depois.
    if (!mudou) throw new Conflict("JA_BLOQUEADO", "Este motorista já está bloqueado.");

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_fleet_data");
    const { id } = await params;

    const mudou = await desbloquearMotorista({ driverId: id, actorUserId: ctx.userId });
    if (!mudou) throw new Conflict("NAO_BLOQUEADO", "Este motorista não está bloqueado.");

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
