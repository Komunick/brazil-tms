import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { spotOfferBodySchema } from "@brazil-tms/shared";
import { recordSpotOffer } from "@brazil-tms/db";
import { Conflict, handleRouteError } from "@/lib/api/respond";
import { Unauthorized } from "@/lib/auth/require-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/imports/spot-offer — a oferta de leilão que o monitor já manda ao Telegram (2026-08-18).
 *
 * O detector não é este serviço: é um userscript numa VM Windows que vive na aba "During Spot
 * Bidding" do portal, captura a consulta do próprio portal, filtra `bid_status = 10` e compara a
 * rota contra a lista de rotas de interesse. Ele está validado em produção (58 de 58 ofertas). Esta
 * rota é só o SEGUNDO destino do mesmo aviso — o que vai para o celular passa a aparecer na TV.
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
