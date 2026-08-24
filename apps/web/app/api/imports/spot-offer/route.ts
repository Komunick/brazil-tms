import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { spotOfferBodySchema } from "@brazil-tms/shared";
import { recordSpotOffer } from "@brazil-tms/db";
import { Conflict, handleRouteError } from "@/lib/api/respond";
import { Unauthorized } from "@/lib/auth/require-auth";
import { avisarSpotNoTelegram } from "@/lib/spot/telegram";

export const dynamic = "force-dynamic";

/**
 * POST /api/imports/spot-offer — a oferta de leilão do portal (2026-08-18).
 *
 * QUEM DETECTA MUDOU EM 2026-08-24, e o contrato desta rota NÃO. Era um userscript numa VM Windows,
 * na aba "During Spot Bidding", a cada 30 segundos; a VM travava sozinha e o script era o único robô
 * sem sinal de vida, então o silêncio dele — legítimo por horas, porque ofertas são raras — não se
 * distinguia de máquina morta.
 *
 * Hoje quem detecta é o robô do PORTAL, na VM Linux, de cinco em cinco segundos: os campos do leilão
 * já vinham na listagem que ele lê há meses. Esta rota não mudou uma linha do formato de propósito —
 * a tela, o som, o aviso do sistema e o cartão do dia já o consomem em produção, e trocar formato
 * junto com origem seria mudar duas coisas ao mesmo tempo e não saber qual quebrou.
 *
 * E o Telegram passou a sair DAQUI: era o script da VM que avisava, e desligar a VM levaria o aviso
 * junto. Ver `lib/spot/telegram.ts`.
 *
 * Autenticada pelo MESMO token do robô do portal (`PORTAL_FEED_TOKEN`), comparado em tempo
 * constante, e recusando-se a funcionar se ele não estiver definido: segredo vazio nunca pode
 * significar "aberto a todos".
 *
 * ── POR QUE O TOKEN PODE VIR NO CORPO ───────────────────────────────────────────────────────────
 *
 * Quem chama é um script rodando na origem do portal do cliente. Um cabeçalho `Authorization`
 * transforma o POST em requisição "não simples" e obriga o navegador a um preflight `OPTIONS` antes
 * de mandar qualquer coisa. Com o token no corpo e `Content-Type: text/plain`, o aviso sai na
 * primeira tentativa. O cabeçalho continua aceito para `curl` e para chamadores que não sejam
 * navegador; o preflight também é respondido, para quem preferir o caminho tradicional.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const cru = await request.text();
    const json = ((): unknown => {
      try {
        return JSON.parse(cru);
      } catch {
        return null;
      }
    })();
    if (!json || typeof json !== "object") {
      throw new Conflict("INVALID_BODY", "Corpo inválido: envie JSON.");
    }

    const body = spotOfferBodySchema.parse(json);
    assertToken(request, body.token);

    const { nova } = await recordSpotOffer(body.offer);

    /**
     * O TELEGRAM SAI DAQUI DESDE 2026-08-24, e três detalhes o mantêm inofensivo.
     *
     * SÓ QUANDO É NOVA. `nova: false` é o robô recontando uma oferta que continua em leilão — ele
     * relê a listagem de cinco em cinco segundos. Avisar de novo encheria o grupo com a mesma
     * oferta doze vezes por minuto enquanto ela estivesse aberta.
     *
     * SEM `await`. Quem chama é o ciclo de spot, e segurar a resposta esperando o Telegram faria
     * uma rede lenta do lado de lá atrasar o ciclo seguinte — que é justamente o que este ciclo
     * existe para evitar.
     *
     * E O ERRO NUNCA SOBE. A oferta já está no banco, e é ela que sustenta a tela, o som e o cartão
     * do dia. O Telegram é um destino a mais: se falhar, o aviso não chega no celular — a oferta
     * não some do sistema.
     */
    if (nova) void avisarSpotNoTelegram(body.offer).catch(() => {});

    // `nova: false` não é erro: é o monitor recontando o que ainda está em leilão depois de um
    // reinício. Responder 200 evita que ele trate isso como falha e fique reenviando.
    return comCors(NextResponse.json({ nova }));
  } catch (error) {
    return comCors(handleRouteError(error));
  }
}

/** O preflight, para quem mandar o token no cabeçalho. */
export function OPTIONS(): NextResponse {
  return comCors(new NextResponse(null, { status: 204 }));
}

/**
 * A resposta é legível de qualquer origem, e isso é deliberado: ela não contém dado nenhum — só
 * `{ nova: boolean }`. O que protege a rota é o token, não a origem de quem chama.
 */
function comCors(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}

function assertToken(request: Request, doCorpo: string | undefined): void {
  const esperado = process.env.PORTAL_FEED_TOKEN;
  if (!esperado) throw new Unauthorized("PORTAL_FEED_TOKEN não configurado no servidor.");
  const cabecalho = request.headers.get("authorization") ?? "";
  const recebido = doCorpo ?? (cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "");
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Unauthorized("Token inválido.");
}
