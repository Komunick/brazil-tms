import { NextResponse } from "next/server";
import { MOTORISTA_JOBS, type MotoristaCadastrarPayload } from "@brazil-tms/shared";
import { getBffBoss } from "@/lib/queue/boss";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * ENVIAR UM PRÉ-CADASTRO À GERENCIADORA (fatia 028, etapa 5).
 *
 * O caminho normal é automático: a leitura da CNH termina e o envio é enfileirado sozinho. Este
 * botão é para o OUTRO caso — o cadastro que parou por faltar alguma coisa, alguém resolveu, e
 * agora precisa de um empurrão. Sem ele, o que falhou uma vez ficaria parado para sempre.
 *
 * ── ENFILEIRA, NÃO CHAMA ──────────────────────────────────────────────────────────────────────
 *
 * A credencial da gerenciadora vive só no worker; o cliente dela mora em `workers/lib/`, fora de
 * `packages/`, exatamente para o app web não conseguir importá-lo. Uma rota que chamasse a Integra
 * exigiria a senha de produção dentro do Next, e a constituição não permite.
 *
 * Devolve 202 — ACEITO, não FEITO. O cadastro existe quando a gerenciadora responder, e dizer
 * "enviado" no instante do clique seria mentira até lá. A tela mostra o desfecho no ciclo seguinte
 * do polling.
 *
 * ── E NÃO CONFERE NADA ────────────────────────────────────────────────────────────────────────
 *
 * Deliberado, e é o contrário do que a rota da Pré-SM faz. Lá a recusa acontece na rota porque
 * cada solicitação CUSTA e a ida à fila é desperdício. Aqui cadastrar é de graça (D7), então o
 * único ganho de conferir seria uma mensagem mais imediata — em troca de ter a regra de "pode
 * enviar" escrita em dois lugares. Duas cópias divergem em silêncio; a mensagem chega em vinte
 * segundos pelo polling.
 *
 * O reenvio também não é problema daqui: a consulta do worker exige `enviado_em IS NULL`, e o
 * índice de CPF é a garantia final. Dez cliques no mesmo botão criam um cadastro só.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_fleet_data");
    const { id } = await params;

    const boss = await getBffBoss();
    const payload: MotoristaCadastrarPayload = { preRegistrationId: id };
    await boss.send(MOTORISTA_JOBS.motoristaCadastrar, payload as object);

    return NextResponse.json({ pedido: true }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
