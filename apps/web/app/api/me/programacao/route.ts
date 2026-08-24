import { NextResponse } from "next/server";
import { z } from "zod";
import { marcarViagem, readProgramacao } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * A PROGRAMAÇÃO — o quadro que substitui a planilha (2026-08-24, a pedido).
 *
 * Era uma lista pessoal: a pessoa procurava a LH e a acrescentava. Virou o quadro inteiro por dia,
 * de ontem em diante, e o que é pessoal passou a ser uma CAMADA por cima — a cor da linha e o
 * esconder. A troca foi pedida para desligar a planilha "PROGRAMAÇÃO 2026", 12.317 linhas mantidas
 * à mão com dados que o TMS já tem.
 *
 * `view_all_trips`: é leitura de viagens com um recorte pessoal em cima, e quem não pode ver viagem
 * não teria o que programar. O `userId` vem SEMPRE da sessão, nunca do corpo — não existe caminho
 * para uma pessoa mexer na marcação de outra.
 */

/**
 * A janela em DIAS, e com teto.
 *
 * Ontem é o padrão para trás porque a viagem que saiu à noite ainda está na estrada de manhã — uma
 * programação que começa em "hoje" perde exatamente a que precisa de atenção. Sete dias à frente
 * cobrem a semana que o cliente publica; o teto de 30 existe para uma URL curiosa não pedir o ano.
 */
const consultaSchema = z.object({
  diasAtras: z.coerce.number().int().min(0).max(30).optional(),
  diasAdiante: z.coerce.number().int().min(0).max(30).optional(),
  regiao: z.string().trim().max(40).optional(),
});

/**
 * A marca é PARCIAL de propósito: a tela manda só o que mudou.
 *
 * Quem pinta uma linha não está decidindo escondê-la, e quem esconde não está apagando a cor. Campo
 * ausente = "não mexa nisso" — `null` na cor, esse sim, é "tire a cor".
 */
const marcaSchema = z.object({
  tripId: z.string().uuid("Viagem inválida."),
  cor: z.string().trim().max(24).nullable().optional(),
  oculta: z.boolean().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    const params = new URL(request.url).searchParams;
    const { diasAtras, diasAdiante, regiao } = consultaSchema.parse({
      diasAtras: params.get("diasAtras") ?? undefined,
      diasAdiante: params.get("diasAdiante") ?? undefined,
      regiao: params.get("regiao") ?? undefined,
    });
    return NextResponse.json({
      linhas: await readProgramacao(ctx.userId, {
        diasAtras,
        diasAdiante,
        // "" é o filtro "Geral" da tela, e não uma região chamada vazio.
        regiao: regiao && regiao !== "" ? regiao : null,
      }),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Marcar: cor, esconder, ou os dois. Idempotente — remarcar a mesma coisa não dá erro. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");
    const { tripId, cor, oculta } = marcaSchema.parse(await request.json().catch(() => ({})));
    await marcarViagem(ctx.userId, tripId, { cor, oculta });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
