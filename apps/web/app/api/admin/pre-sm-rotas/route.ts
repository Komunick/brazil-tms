import { NextResponse } from "next/server";
import { z } from "zod";
import { definirConfirmacaoDaCorrespondencia, listarCorrespondencias } from "@brazil-tms/db";
import { PRE_SM_JOBS, type PreSmCarregarCadastroPayload } from "@brazil-tms/shared";
import { getBffBoss } from "@/lib/queue/boss";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { Conflict, handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * A CONFERÊNCIA DA PONTE ROTA → MODELO (2026-08-25, fatia 026).
 *
 * A carga propõe as correspondências entre as nossas rotas e os modelos de Pré-SM da gerenciadora
 * Logae; esta rota é onde uma pessoa olha e confirma. **Só linha confirmada cria Pré-SM.**
 *
 * Não é burocracia: o casamento é por nome de estação, e quando erra não erra em branco — erra
 * apontando para OUTRA rota. Uma Pré-SM com o modelo errado é escolta contratada para um trajeto
 * que o caminhão não vai fazer, e ninguém percebe até o veículo estar na estrada.
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `manage_commercial_data`, a mesma chave da malha de rotas — é a mesma natureza de decisão: qual
 * rota é qual. Não é `assign_resources`: quem escala usa o resultado disto, não o define.
 *
 * ── E É AUDITADO ──────────────────────────────────────────────────────────────────────────────
 *
 * Confirmar uma correspondência autoriza gasto: a gerenciadora cobra por solicitação. Quem
 * confirmou e quando precisa ficar registrado.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_commercial_data");
    return NextResponse.json({ items: await listarCorrespondencias() });
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

    // A auditoria vai junto, na mesma transação — ver `pre-sm-modelos.ts`.
    const mudou = await definirConfirmacaoDaCorrespondencia({
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
 * PEDIR A CARGA — buscar os modelos na gerenciadora e propor as correspondências.
 *
 * ── POR QUE ENFILEIRA EM VEZ DE CHAMAR ────────────────────────────────────────────────────────
 *
 * A credencial da Logae vive **só no worker**. Uma rota do app web que chamasse a Integra exigiria
 * a senha de produção dentro do Next, e a constituição não permite. Mesma regra da criação e do
 * cancelamento.
 *
 * ── E POR QUE ISTO NÃO PRECISA DE CONFIRMAÇÃO ─────────────────────────────────────────────────
 *
 * A carga é LEITURA: consulta os modelos cadastrados e grava propostas, todas por conferir. Não
 * cria Pré-SM, não gasta nada, e `DO NOTHING` em conflito significa que repetir não desfaz a
 * conferência de ninguém. O ato que custa dinheiro é confirmar uma linha — e esse já é o PATCH,
 * que é auditado.
 *
 * Devolve 202: o trabalho acontece no worker, e as linhas aparecem quando ele terminar.
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
