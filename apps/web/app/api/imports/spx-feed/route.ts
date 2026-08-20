import { NextResponse } from "next/server";
import { recordSpxRouterEvent } from "@brazil-tms/db";
import { SpxJwtInvalid, verifySpxJwt } from "@/lib/imports/spx-jwt";

export const dynamic = "force-dynamic";

/**
 * POST /api/imports/spx-feed — o push do Agency Router da SPX (2026-08-20).
 *
 * É a PRIMEIRA rota de ingestão que não é chamada por robô nosso: quem chama é a Shopee, de fora,
 * a cada evento do motorista. Isso muda três coisas em relação às outras rotas de `imports/`.
 *
 * ── 1. A RESPOSTA É O CONTRATO DELES, NÃO O NOSSO ──────────────────────────────────────────────
 *
 * `{"retcode": 0, "message": "success"}` com HTTP 200 é o que o documento manda responder. Não é
 * o formato das nossas outras rotas, e não deve ser: quem lê isto é o servidor da Shopee, e um
 * corpo diferente do combinado vira "entrega falhou" no lado deles.
 *
 * ── 2. RECEBER É MAIS IMPORTANTE QUE ENTENDER ──────────────────────────────────────────────────
 *
 * Depois que a assinatura confere, o evento é gravado CRU e a resposta é sucesso — mesmo que o
 * `content_data` esteja num formato que a gente não reconheça. A alternativa seria recusar payload
 * estranho, e o resultado prático disso é perder exatamente os eventos que mais ensinariam. O que
 * não conhecemos fica na tabela esperando alguém abrir.
 *
 * ── 3. O SEGREDO É A PORTA INTEIRA ─────────────────────────────────────────────────────────────
 *
 * Não há token nosso aqui: quem autentica é a assinatura HS256 com o segredo que a Shopee cadastra
 * para a nossa agência. Sem `SPX_ROUTER_SECRET` a rota responde 503 e não grava nada — segredo
 * ausente jamais pode significar "aberto a todos", a mesma regra das outras três rotas de ingestão.
 *
 * ── POR QUE 200 EM DUPLICATA E 401 EM ASSINATURA ERRADA ────────────────────────────────────────
 *
 * Reentrega do mesmo `trace_id` responde sucesso: o evento já está gravado, e dizer "erro" faria a
 * Shopee retentar para sempre. Assinatura inválida responde 401 e retcode 1 — aí não é reentrega,
 * é alguém que não deveria estar falando com esta URL, e queremos que pare.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const segredo = process.env.SPX_ROUTER_SECRET;
  if (!segredo) {
    // 503 e não 401: o problema é nosso, e o código diz ao remetente que vale a pena tentar de novo.
    return responder(503, 1, "Integração não configurada no servidor.");
  }

  let token: string;
  try {
    const cru = await request.text();
    const json = JSON.parse(cru) as unknown;
    const corpo = (json ?? {}) as Record<string, unknown>;
    if (typeof corpo.jwt !== "string" || corpo.jwt.trim() === "") {
      return responder(400, 1, 'Corpo inválido: envie {"jwt": "..."}.');
    }
    token = corpo.jwt.trim();
  } catch {
    return responder(400, 1, "Corpo inválido: envie JSON.");
  }

  let claims;
  try {
    claims = verifySpxJwt(token, segredo);
  } catch (error) {
    if (error instanceof SpxJwtInvalid) return responder(401, 1, error.message);
    throw error;
  }

  try {
    await recordSpxRouterEvent({
      traceId: claims.data.traceId,
      dataType: claims.data.dataType,
      agencyId: claims.data.agencyId,
      payload: claims.data.contentData,
      signedAtUnix: claims.timestamp,
    });
  } catch (error) {
    /**
     * Falha de banco responde 500 DE PROPÓSITO, e é a única vez que se pede reentrega.
     *
     * Aqui o evento é legítimo e nós é que não conseguimos guardar. Responder sucesso perderia o
     * dado em silêncio; responder erro faz a Shopee mandar de novo, e o `trace_id` único garante
     * que a segunda tentativa não duplique.
     */
    console.error("[spx-feed] falha ao gravar evento", claims.data.traceId, error);
    return responder(500, 1, "Falha ao gravar o evento.");
  }

  return responder(200, 0, "success");
}

function responder(status: number, retcode: number, message: string): NextResponse {
  return NextResponse.json({ retcode, message }, { status });
}
