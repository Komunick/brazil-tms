import { NextResponse } from "next/server";
import { z } from "zod";
import {
  readRegistrosDoMotorista,
  readRotasDoMotorista,
  registrarNoMotorista,
} from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * O HISTÓRICO DE UM MOTORISTA (2026-08-24, a pedido).
 *
 * GET devolve as duas metades juntas: as ROTAS que ele já rodou (derivadas das viagens) e os
 * REGISTROS que alguém escreveu sobre ele. Numa chamada só porque a tela mostra as duas ao mesmo
 * tempo — dois pedidos para preencher um painel seriam duas esperas para uma decisão.
 *
 * ── AS DUAS PERMISSÕES SÃO DIFERENTES, E DE PROPÓSITO ─────────────────────────────────────────
 *
 * LER exige `view_all_trips`: é a mesma régua de quem vê viagem, e o histórico existe para ajudar a
 * escalar. ESCREVER exige `assign_resources` — quem registra reclamação ou advertência é quem
 * escala, e o registro pesa sobre uma pessoa de verdade. Deixar qualquer um escrever transformaria
 * um caderno de ocorrências em mural de recado.
 */
const TIPOS = ["reclamacao", "atraso", "elogio", "advertencia"] as const;

const corpoSchema = z.object({
  /**
   * A lista é fechada (decisão do usuário, 2026-08-24). É o que permite CONTAR depois — com texto
   * livre, "reclamação", "reclamacao" e "RECLAMAÇÃO" viram três coisas e a conta nunca fecha.
   */
  tipo: z.enum(TIPOS),
  /** Obrigatório: categoria sem explicação não ajuda ninguém a decidir nada, depois. */
  texto: z.string().trim().min(1, "Escreva o que aconteceu.").max(2000),
  /** A viagem em que aconteceu, quando houve uma. */
  tripId: z.string().uuid().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    const { id } = await params;
    const [rotas, registros] = await Promise.all([
      readRotasDoMotorista(id),
      readRegistrosDoMotorista(id),
    ]);
    return NextResponse.json({ rotas, registros });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");
    const { id } = await params;
    const corpo = corpoSchema.parse(await request.json().catch(() => ({})));
    await registrarNoMotorista({
      driverId: id,
      tipo: corpo.tipo,
      texto: corpo.texto,
      tripId: corpo.tripId ?? null,
      // Sempre da sessão, nunca do corpo: ocorrência sem autor verdadeiro é boato assinado.
      createdByUserId: ctx.userId,
    });
    return NextResponse.json({ registros: await readRegistrosDoMotorista(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
