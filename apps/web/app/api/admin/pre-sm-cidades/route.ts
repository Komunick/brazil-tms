import { NextResponse } from "next/server";
import { z } from "zod";
import { definirConfirmacaoDaCidade, listarCorrespondenciasDeCidade } from "@brazil-tms/db";
import { PRE_SM_JOBS, type PreSmCarregarCadastroPayload } from "@brazil-tms/shared";
import { getBffBoss } from "@/lib/queue/boss";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { Conflict, handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * A CONFERÊNCIA DA PONTE ESTAÇÃO → CIDADE (2026-08-26, fatia 027).
 *
 * A carga propõe o código IBGE de cada estação nossa, tirado do NOME dela; esta rota é onde uma
 * pessoa olha e confirma. **Só linha confirmada vale para criar Pré-SM.**
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `manage_commercial_data`, a mesma chave da tela de rotas e da malha. **Não** é
 * `assign_resources`: quem escala USA esta decisão, não a toma — senão a pessoa impedida de escalar
 * alguém poderia se autoliberar confirmando uma correspondência.
 *
 * ── E É AUDITADO ──────────────────────────────────────────────────────────────────────────────
 *
 * Confirmar autoriza gasto: a gerenciadora cobra por solicitação. Quem confirmou e quando precisa
 * ficar registrado, e a auditoria vai na MESMA transação da mudança.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_commercial_data");
    return NextResponse.json({ items: await listarCorrespondenciasDeCidade() });
  } catch (error) {
    return handleRouteError(error);
  }
}

const corpo = z.object({
  id: z.string().uuid(),
  confirmar: z.boolean(),
});

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_commercial_data");
    const body = corpo.parse(await request.json());

    const mudou = await definirConfirmacaoDaCidade({
      id: body.id,
      confirmar: body.confirmar,
      actorUserId: ctx.userId,
    });

    // `false` não é erro: é pedido para confirmar o que já estava confirmado (ou o contrário).
    // Dizer isso em vez de fingir sucesso evita que a tela mostre uma mudança que não houve.
    if (!mudou) throw new Conflict("SEM_MUDANCA", "A correspondência já estava nesse estado.");

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PEDIR A CARGA — buscar o cadastro da gerenciadora e propor as correspondências.
 *
 * É **o mesmo trabalho** que o botão da tela de rotas dispara, e de propósito: uma carga só enche as
 * duas tabelas, porque cidades e rotas saem da mesma chamada ao `getRotas` (R6). Ter o botão nas
 * duas telas é conveniência — quem está numa não precisa navegar até a outra.
 *
 * Enfileira em vez de chamar: a credencial da Logae vive **só no worker**. Mesma regra da criação e
 * do cancelamento.
 *
 * Não pede confirmação porque é **leitura**: consulta o cadastro e grava propostas, todas por
 * conferir. O ato que custa dinheiro é confirmar uma linha — e esse é o PATCH, que é auditado.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_commercial_data");

    const boss = await getBffBoss();
    const payload: PreSmCarregarCadastroPayload = { pedidoPor: ctx.userId };
    await boss.send(PRE_SM_JOBS.preSmCarregarCadastro, payload as object);

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
