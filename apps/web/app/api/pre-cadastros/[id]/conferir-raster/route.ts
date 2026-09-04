import { NextResponse } from "next/server";
import { MOTORISTA_JOBS } from "@brazil-tms/shared";
import { getBffBoss } from "@/lib/queue/boss";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * PERGUNTAR À GERENCIADORA o que ela já sabe deste CPF (2026-09-03, a pedido).
 *
 * ── ELA É O CONTRÁRIO DA ROTA DE PESQUISA AO LADO ─────────────────────────────────────────────
 *
 * Aquela gasta; esta existe justamente para que aquela não gaste à toa. A gerenciadora **não
 * bloqueia pesquisa repetida** (usuário, 03/09): mandar duas vezes cria duas pesquisas e cobra as
 * duas, em silêncio. Perguntar antes é o único jeito de não pagar duas vezes.
 *
 * Por isso o corpo é vazio e não há escolha nenhuma a fazer: não existe variante cara da pergunta.
 *
 * ── POR QUE ENFILEIRA EM VEZ DE PERGUNTAR AQUI ────────────────────────────────────────────────
 *
 * A credencial da gerenciadora vive só no worker. E a resposta demora: são quatro chamadas em
 * série, e a Integra recusa chamadas próximas demais (`CodErro 102`, 30 s de espera), então a
 * conferência leva perto de um minuto e meio. Uma rota síncrona seria uma requisição pendurada.
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `manage_fleet_data`, a mesma da conferência e a mesma do pedido de pesquisa. Quem confere é quem
 * decide, e uma chave nova só para uma leitura de graça seria mais uma para administrar.
 *
 * ── 202, e clicar duas vezes não machuca ──────────────────────────────────────────────────────
 *
 * Não há trava contra o clique repetido porque não há o que travar: a conferência é leitura, custa
 * tempo e não dinheiro, e a segunda simplesmente reescreve o mesmo retrato.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_fleet_data");

    const { id } = await params;

    const boss = await getBffBoss();
    await boss.send(MOTORISTA_JOBS.motoristaConferirRaster, { preRegistrationId: id });

    return NextResponse.json({ pedido: true }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
