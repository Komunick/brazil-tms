import { NextResponse } from "next/server";
import { vinculosPorPlaca } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/fleet/vinculos?placas=ABC1D23,XYZ4E56 — o que já está classificado (2026-08-25, 026).
 *
 * O diálogo de atribuição usa isto para não perguntar de novo o vínculo de um recurso que alguém já
 * classificou (FR-010).
 *
 * ── NÃO CHAMA A GERENCIADORA ──────────────────────────────────────────────────────────────────
 *
 * Lê só o nosso banco. A sugestão a partir do dono do veículo, que exigiria a Integra, fica no
 * worker na fatia seguinte — o plano desta fatia chegou a propor expor isso aqui, o que colocaria a
 * credencial de produção da Logae dentro do app web e furaria a regra de segredos.
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `assign_resources`, a mesma chave de quem atribui — é exatamente essa pessoa que vê o campo. Não
 * é `manage_fleet_data`: consultar a classificação para escalar não é administrar o cadastro.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");

    const cru = new URL(request.url).searchParams.get("placas") ?? "";
    // Teto de 3: uma composição leva cavalo e até duas carretas. Sem ele, uma URL montada à mão
    // viraria uma consulta de mil placas — a rota é de leitura, mas leitura sem limite também cai.
    const placas = cru.split(",").map((p) => p.trim()).filter(Boolean).slice(0, 3);
    if (placas.length === 0) return NextResponse.json({ vinculos: {} });

    return NextResponse.json({ vinculos: await vinculosPorPlaca(placas) });
  } catch (error) {
    return handleRouteError(error);
  }
}
