import { NextResponse } from "next/server";
import { frotaComPosicao } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * ONDE ESTÁ A FROTA — as posições com coordenada (2026-08-26, a pedido).
 *
 * `view_all_trips`, e não `manage_fleet_data`: quem olha isto está acompanhando viagem ou
 * escolhendo quem escalar, não administrando cadastro de veículo.
 *
 * A idade máxima é parâmetro com teto, e o padrão é 24 horas. Sem teto, uma URL curiosa pediria a
 * frota inteira desde sempre — e uma posição de março não ajuda ninguém a decidir nada hoje.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    const bruto = Number(new URL(request.url).searchParams.get("minutos"));
    const minutos =
      Number.isFinite(bruto) && bruto > 0 ? Math.min(Math.floor(bruto), 7 * 24 * 60) : 24 * 60;
    return NextResponse.json({ veiculos: await frotaComPosicao(minutos) });
  } catch (error) {
    return handleRouteError(error);
  }
}
