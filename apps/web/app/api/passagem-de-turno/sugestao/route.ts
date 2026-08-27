import { NextResponse } from "next/server";
import { sugestaoPelaLH, sugestaoPeloMotorista } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * O QUE O TMS SABE SOBRE UMA LH (ou sobre um motorista) — para preencher o item (2026-08-27).
 *
 * ── É LEITURA, E DEVOLVE SUGESTÃO ─────────────────────────────────────────────────────────────
 *
 * Nada é gravado aqui. O que volta é uma proposta; quem decide o que entra no item é
 * `aplicarSugestao`, no cliente, que só preenche campo VAZIO — e depois a gravação passa pela rota
 * de item, com a conferência de sempre. Esta rota não é atalho para escrever.
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `view_all_trips`, a mesma da página. Não há guarda de setor: quem PODE ler o diário pode
 * consultar a LH, e negar isso a quem não tem setor deixaria a busca muda justamente para quem
 * ainda está sendo cadastrado.
 *
 * O telefone do motorista sai por aqui, e é dado pessoal. Fica atrás da mesma porta porque a seção
 * "motorista disponível" da planilha JÁ traz telefone digitado à mão — quem preenche o diário já
 * tem esse número na tela do portal. O que muda é parar de redigitá-lo.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");

    const url = new URL(request.url);
    const lh = (url.searchParams.get("lh") ?? "").trim();
    const motorista = (url.searchParams.get("motorista") ?? "").trim();

    /*
     * Um teto de tamanho antes de tocar no banco.
     *
     * Uma LH tem treze caracteres e um nome raramente passa de setenta. Sem o teto, um campo colado
     * com um parágrafo inteiro viraria uma varredura de tabela por engano de `Ctrl+V` — e o
     * responsável seria a tela, não quem colou.
     */
    if (lh.length > 64 || motorista.length > 160) {
      return NextResponse.json({ error: "Consulta longa demais." }, { status: 400 });
    }

    if (lh) return NextResponse.json({ sugestao: await sugestaoPelaLH(lh) });
    if (motorista) return NextResponse.json({ sugestao: await sugestaoPeloMotorista(motorista) });

    return NextResponse.json({ error: "Informe `lh` ou `motorista`." }, { status: 400 });
  } catch (error) {
    return handleRouteError(error);
  }
}
