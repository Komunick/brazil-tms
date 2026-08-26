import { NextResponse } from "next/server";
import { marcasDaProgramacao } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * AS MARCAS DA PROGRAMAÇÃO — o que muda de minuto a minuto (2026-08-26, a pedido).
 *
 * Rota IRMÃ de `/api/me/programacao`, e de propósito muito mais barata: três colunas por viagem
 * marcada, contra vinte por linha do quadro inteiro. É o que permite consultá-la num passo curto
 * sem tornar a tela pesada.
 *
 * Mesma permissão da rota do quadro — é o mesmo dado, visto de perto. E o status é compartilhado,
 * então aqui NÃO há recorte por usuário: quem vê a programação vê as marcas de todos.
 *
 * Sem `regiao` nem janela de dias: ela devolve um superconjunto e a tela usa o que casa com as
 * linhas que já tem. O porquê está em `marcas-da-programacao.ts` — em resumo, repetir o recorte
 * seriam duas cópias da mesma regra, que divergem no primeiro ajuste.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    return NextResponse.json({ marcas: await marcasDaProgramacao() });
  } catch (error) {
    return handleRouteError(error);
  }
}
