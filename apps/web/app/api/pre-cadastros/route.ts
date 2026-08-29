import { NextResponse } from "next/server";
import { listarFilaDePreCadastros } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * A FILA DE PRÉ-CADASTROS, para dentro (fatia 028, etapa 2).
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `manage_fleet_data` — a mesma permissão do cadastro de motorista, e de propósito: quem confere um
 * pré-cadastro está fazendo trabalho de cadastro de motorista, e criar uma permissão nova para o
 * mesmo grupo de pessoas seria uma chave a mais para administrar sem nada em troca.
 *
 * ── ESTA É A ÚNICA PORTA QUE LÊ ───────────────────────────────────────────────────────────────
 *
 * A rota pública só ESCREVE. Não existe, e não vai existir, rota sem sessão que consulte
 * pré-cadastro — é isso que impede o formulário de virar uma máquina de descobrir quem já está
 * cadastrado. Toda leitura passa por aqui, com sessão e permissão.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_fleet_data");
    return NextResponse.json({ items: await listarFilaDePreCadastros() });
  } catch (error) {
    return handleRouteError(error);
  }
}
