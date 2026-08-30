import { NextResponse } from "next/server";
import { z } from "zod";
import { CAMPOS_DO_CADASTRO } from "@brazil-tms/shared";
import { preCadastroParaConferencia, salvarCamposConferidos } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { apiError, handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * UM PRÉ-CADASTRO INTEIRO, para a tela de conferência (fatia 028, etapa 4).
 *
 * A fila mostra o bastante para escolher em qual linha trabalhar. Isto é o que a pessoa precisa
 * para de fato conferir: todos os campos, cada um com a procedência, e os ids das fotos.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_fleet_data");

    const { id } = await params;
    const item = await preCadastroParaConferencia(id);
    // 404 também para o arquivado: ele existe para o histórico, não para voltar a ser trabalhado.
    if (!item) return apiError(404, "NOT_FOUND", "Pré-cadastro não encontrado.");

    return NextResponse.json(item);
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * O FUNCIONÁRIO CORRIGIU.
 *
 * ── O TMS REVALIDA, mesmo o que a tela já validou ─────────────────────────────────────────────
 *
 * Regra da fatia (armadilha 2): uma requisição feita fora da tela chega igual à feita por dentro.
 * O teto de tamanho existe pela mesma razão — um campo de texto sem limite é um campo de texto sem
 * limite, venha de onde vier.
 *
 * ── VALOR VAZIO É APAGAR, e é deliberado ──────────────────────────────────────────────────────
 *
 * String vazia volta o campo a VAZIO E ASSINALADO. Quem conferiu e viu que o modelo inventou um RG
 * precisa poder tirá-lo: sem isso, a única saída seria deixar o valor errado ou digitar outro
 * errado por cima — e o vazio é justamente o que interrompe quem revisa depois.
 *
 * O que NÃO se aceita é chave que não existe no cadastro; a lista de campos é fechada.
 */
const corpo = z.object({
  campos: z.record(z.enum(CAMPOS_DO_CADASTRO), z.string().max(200).nullable()),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_fleet_data");

    const { id } = await params;
    const { campos } = corpo.parse(await request.json());
    const r = await salvarCamposConferidos(id, campos, ctx.userId);

    // `salvo: false` é "não existe, ou já foi enviado" — e já enviado não se edita: o cadastro é o
    // retrato do que foi mandado, e mexer aqui faria o TMS discordar da gerenciadora em silêncio.
    if (!r.salvo) return apiError(409, "JA_ENVIADO", "Este cadastro já foi enviado e não se edita.");

    return NextResponse.json(r);
  } catch (error) {
    return handleRouteError(error);
  }
}
