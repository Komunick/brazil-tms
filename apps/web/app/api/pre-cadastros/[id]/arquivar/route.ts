import { NextResponse } from "next/server";
import { z } from "zod";
import { arquivarPreCadastro } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * ARQUIVAR um pré-cadastro (fatia 028, etapa 2).
 *
 * O descarte MARCA, não apaga — princípio III. A linha sai da fila e continua no banco, com autor,
 * hora e motivo, e o índice único de CPF é parcial justamente para que a pessoa possa voltar.
 *
 * O MOTIVO é obrigatório e vem do corpo. Meses depois, "arquivado" sem motivo não distingue
 * duplicata de trote de cadastro legítimo fechado por engano — e não haverá a quem perguntar.
 */
const corpo = z.object({
  motivo: z.string().trim().min(3, "Diga por que está arquivando.").max(500),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_fleet_data");

    const { id } = await params;
    const { motivo } = corpo.parse(await request.json());
    const arquivado = await arquivarPreCadastro(id, ctx.userId, motivo);

    // `false` é "já estava arquivado, ou não existe" — não é erro. Dois cliques na mesma linha não
    // podem virar duas histórias diferentes no histórico.
    return NextResponse.json({ arquivado });
  } catch (error) {
    return handleRouteError(error);
  }
}
