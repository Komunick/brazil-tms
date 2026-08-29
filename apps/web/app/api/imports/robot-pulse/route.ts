import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { robotPulseSchema } from "@brazil-tms/shared";
import { recordRobotCycle } from "@brazil-tms/db";
import { handleRouteError } from "@/lib/api/respond";
import { Unauthorized } from "@/lib/auth/require-auth";

export const dynamic = "force-dynamic";

/**
 * O PULSO DE UM ROBÔ QUE NEM SEMPRE TEM O QUE ENTREGAR (2026-08-29).
 *
 * ── O PONTO CEGO QUE ISTO FECHA ────────────────────────────────────────────────────────────────
 *
 * Os ciclos de leitura gravam o pulso ao ENTREGAR uma página: quem entrega, prova que rodou. O
 * ciclo de spot não entrega nada quando não há leilão aberto — e não há leilão aberto quase o
 * tempo todo. Ele varre de cinco em cinco segundos e fica mudo por horas.
 *
 * O resultado é que "oito horas sem oferta" tinha duas leituras opostas — mercado parado ou robô
 * morto — e nada no sistema distinguia as duas. Foi exatamente a dúvida de 29/08, com uma viagem
 * de rota permitida que nunca virou aviso: sem pulso, não deu para dizer se falhou.
 *
 * ── POR QUE UMA ROTA PRÓPRIA ──────────────────────────────────────────────────────────────────
 *
 * A rota do feed grava o pulso, mas exige um `payload` e o ingere. Mandar uma página vazia só para
 * registrar presença seria mentir no caminho de dados para dizer a verdade no de saúde.
 *
 * Aqui só entra o pulso: quem, de quanto em quanto, e quanto levou. Nada toca viagem.
 *
 * E o aviso de sufoco sai de graça: `countRobotsSufocando` compara duração com intervalo sobre a
 * tabela inteira, sem lista de robôs — quem grava, passa a ser vigiado.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = robotPulseSchema.parse(await request.json());

    /**
     * Mesmo token dos outros robôs, no CORPO e não no cabeçalho: quem chama roda na origem do
     * fornecedor, e um `Authorization` obrigaria a um preflight que depende de o outro lado abrir
     * CORS. Ver a rota de `portal-feed`.
     */
    const esperado = process.env.PORTAL_FEED_TOKEN ?? "";
    const recebido = body.token ?? "";
    const a = Buffer.from(esperado);
    const b = Buffer.from(recebido);
    if (!esperado || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Unauthorized("Token inválido.");
    }

    await recordRobotCycle({
      robot: body.robot,
      intervalMs: body.cicloMs ?? null,
      durationMs: body.duracaoMs ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
