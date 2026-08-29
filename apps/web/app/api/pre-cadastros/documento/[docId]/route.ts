import { NextResponse } from "next/server";
import { chaveDoDocumentoDePreCadastro } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { apiError, handleRouteError } from "@/lib/api/respond";
import { documentsBucket, signedUrl } from "@/lib/supabase/storage";

export const dynamic = "force-dynamic";

/** Trinta segundos: tempo de abrir a aba, não de circular por aí. */
const VALIDADE_SEGUNDOS = 30;

/**
 * ABRIR a foto de um pré-cadastro (fatia 028, etapa 2).
 *
 * Mesma postura da 025: assina um link de curta duração e **redireciona** (302), para a tela poder
 * usar um `<a target="_blank">` simples. Devolver `{ url }` e abrir por JavaScript depois de um
 * `await` é o que os navegadores bloqueiam como popup, em silêncio.
 *
 * ── O BUCKET É PRIVADO, E CONTINUA ────────────────────────────────────────────────────────────
 *
 * A foto é de um documento pessoal — CPF, filiação, endereço. Nada aqui torna o objeto público: o
 * link vale trinta segundos, é assinado no servidor e a chave de serviço nunca sai dele.
 *
 * A autorização de QUAL documento pode ser aberto mora em `chaveDoDocumentoDePreCadastro`, junto da
 * consulta — e não aqui, onde ficaria a um `if` de distância de ser esquecida.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ docId: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_fleet_data");

    const { docId } = await params;
    const chave = await chaveDoDocumentoDePreCadastro(docId);
    // 404 e não 403: dizer "existe, mas não é seu" já contaria algo sobre o que existe.
    if (!chave) return apiError(404, "NOT_FOUND", "Documento não encontrado.");

    return NextResponse.redirect(await signedUrl(chave, VALIDADE_SEGUNDOS, documentsBucket()), 302);
  } catch (error) {
    return handleRouteError(error);
  }
}
