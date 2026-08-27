import { NextResponse } from "next/server";
import { linhaDoTempo } from "@brazil-tms/db";
import { setorValido } from "@brazil-tms/shared";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * A LINHA DO TEMPO — os blocos anteriores (2026-08-26).
 *
 * Sem guarda de setor: ler é de todos, e é o ponto. Quem entra no turno precisa ver o que o setor
 * ao lado registrou.
 *
 * `setor` vazio traz os cinco, que é a visão de quem só acompanha. Traz a CONTAGEM de itens e não os
 * itens — a lista existe para escolher o que abrir, e carregar o conteúdo de trinta blocos seria
 * carregar o diário inteiro a cada abertura de página.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");

    const url = new URL(request.url);
    const setor = setorValido(url.searchParams.get("setor"));
    const bruto = Number(url.searchParams.get("limite") ?? "30");
    // Teto de 200: a linha do tempo é para navegar, não para exportar o histórico.
    const limite = Number.isFinite(bruto) ? Math.min(Math.max(Math.trunc(bruto), 1), 200) : 30;

    return NextResponse.json({ blocos: await linhaDoTempo(setor, limite) });
  } catch (error) {
    return handleRouteError(error);
  }
}
