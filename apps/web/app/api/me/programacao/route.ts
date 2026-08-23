import { NextResponse } from "next/server";
import { z } from "zod";
import { acompanharViagem, pararDeAcompanhar, readMinhaProgramacao } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * Minha Programação — a lista pessoal de viagens acompanhadas (2026-08-23, a pedido).
 *
 * `view_all_trips`: é uma leitura de viagens com um recorte pessoal por cima, e quem não pode ver
 * viagem não teria o que acompanhar. O `userId` vem SEMPRE da sessão, nunca do corpo — não existe
 * caminho para uma pessoa mexer na lista de outra.
 */
const corpoSchema = z.object({ tripId: z.string().uuid("Viagem inválida.") });

export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    return NextResponse.json({ viagens: await readMinhaProgramacao(ctx.userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Entrar na lista. Idempotente: clicar duas vezes não duplica nem devolve erro. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    const { tripId } = corpoSchema.parse(await request.json().catch(() => ({})));
    await acompanharViagem(ctx.userId, tripId);
    return NextResponse.json({ viagens: await readMinhaProgramacao(ctx.userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Sair da lista. O `tripId` vai na QUERY porque `DELETE` com corpo é aceito por uns clientes e
 * ignorado por outros — e um apagar que às vezes não chega é pior do que um verbo feio.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    const { tripId } = corpoSchema.parse({
      tripId: new URL(request.url).searchParams.get("tripId") ?? "",
    });
    await pararDeAcompanhar(ctx.userId, tripId);
    return NextResponse.json({ viagens: await readMinhaProgramacao(ctx.userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}
