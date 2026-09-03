import { NextResponse } from "next/server";
import { motoristasDisponiveis } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * QUEM ESTÁ LIVRE PARA RECEBER CARGA (fatia 031, 03/09).
 *
 * ── SEM PARÂMETRO NENHUM, e isso é decisão ────────────────────────────────────────────────────
 *
 * A busca e a ordenação são estado da TELA. Mandá-las para cá faria a lista recarregar a cada tecla
 * e trocar o resultado debaixo de quem está digitando — o oposto do que a fatia promete. A lista
 * inteira tem ~215 linhas e cabe numa resposta; filtrar no navegador é instantâneo e não pisca.
 *
 * ── SÓ LEITURA ────────────────────────────────────────────────────────────────────────────────
 *
 * Não existe rota de escrita nesta fatia, e não deve nascer nenhuma: "disponível" não é dado nosso,
 * é conclusão tirada a cada leitura. Atribuir continua na Expedição, onde o gesto já existe inteiro
 * com as suas travas.
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `view_all_trips`, a mesma da Torre de Controle e a mesma de Minha Programação. A lista é feita de
 * viagens; quem não pode vê-las não teria o que ler aqui. Nenhuma permissão nova.
 *
 * ── LISTA VAZIA É 200 ─────────────────────────────────────────────────────────────────────────
 *
 * Nunca 404. "Ninguém disponível agora" é uma resposta legítima e é o que a tela escreve em
 * palavras; um 404 faria a tela mostrar erro sobre um dia tranquilo.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");

    return NextResponse.json(await motoristasDisponiveis());
  } catch (error) {
    return handleRouteError(error);
  }
}
