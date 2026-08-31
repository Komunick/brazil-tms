import { NextResponse } from "next/server";
import { z } from "zod";
import { criarSelo, listarSelos } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/** A paleta é fechada — o mesmo conjunto que o cartão sabe desenhar. */
const CORES = ["vermelho", "ambar", "verde", "azul", "roxo", "cinza"] as const;
const criarSchema = z.object({
  nome: z.string().trim().min(2).max(30),
  cor: z.enum(CORES),
});

/**
 * Os selos existem para QUALQUER autenticado ver — eles aparecem no cartão de todo mundo.
 * Criar e apagar exige `manage_users`. Nenhuma destas rotas toca em autorização (FR-013).
 */
export async function GET(): Promise<NextResponse> {
  try {
    await requireAuth();
    return NextResponse.json({ selos: await listarSelos() });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_users");
    const { nome, cor } = criarSchema.parse(await request.json());
    return NextResponse.json({ id: await criarSelo(nome, cor, ctx.userId) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
