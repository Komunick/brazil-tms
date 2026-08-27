import { NextResponse } from "next/server";
import { placasDoMotorista } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * AS PLACAS QUE ESTE MOTORISTA JÁ RODOU — sugestão no diálogo de atribuição (2026-08-27).
 *
 * `assign_resources`, a mesma chave de quem atribui: quem não pode escalar não tem o que fazer com
 * a informação, e ela diz com quem cada caminhão anda.
 *
 * Leitura pura. O que volta é sugestão — quem preenche o campo é a pessoa, com um clique.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");

    const driverId = (new URL(request.url).searchParams.get("driverId") ?? "").trim();

    /*
     * DUAS FORMAS DE CHAVE, porque há dois mecanismos de atribuição.
     *
     * Numérica é o id do PORTAL, que o diálogo da Expedição e da Minha Programação usa. UUID é o do
     * NOSSO cadastro, que a atribuição interna da Torre de Controle usa. A consulta resolve o
     * segundo para o primeiro.
     *
     * Barrar aqui o que não é nem um nem outro evita uma ida ao banco que só poderia voltar vazia —
     * e fecha a porta para um parâmetro colado por engano virar varredura.
     */
    const numerica = /^\d{1,20}$/.test(driverId);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(driverId);
    if (!numerica && !uuid) {
      return NextResponse.json({ placas: [] });
    }

    return NextResponse.json({ placas: await placasDoMotorista(driverId) });
  } catch (error) {
    return handleRouteError(error);
  }
}
