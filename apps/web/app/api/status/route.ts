import { NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { queryServerStatus } from "@brazil-tms/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/status — o pulso do que alimenta o TMS: os robôs e as tarefas do worker.
 *
 * `view_all_trips` e não uma chave de administração, de propósito. A pergunta que esta tela responde
 * é "os números que estou vendo ainda são de agora?", e quem precisa dessa resposta é quem usa o
 * quadro — não só quem administra o servidor. Uma tela de saúde que só o administrador enxerga
 * repete o defeito que ela existe para corrigir: em 2026-08-18 o robô ficou seis horas parado e
 * ninguém percebeu, porque o único sinal estava onde ninguém olha.
 *
 * Somente leitura, e nada aqui expõe segredo: são carimbos de tempo e nomes de fila.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    return NextResponse.json(await queryServerStatus());
  } catch (error) {
    return handleRouteError(error);
  }
}
