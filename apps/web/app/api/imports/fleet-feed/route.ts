import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { fleetFeedBodySchema } from "@brazil-tms/shared";
import { recordFleetPositions, recordRobotCycle } from "@brazil-tms/db";
import { Conflict, handleRouteError } from "@/lib/api/respond";
import { Unauthorized } from "@/lib/auth/require-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/imports/fleet-feed — onde a frota está agora, segundo o rastreador (2026-08-20).
 *
 * Quem lê é um userscript na VM, na tela "Veículos Logísticos" do eTorre. Ele consulta o
 * fornecedor uma vez por ciclo — a MESMA chamada que a tela faria — e entrega o recorte ao TMS.
 * Nenhuma requisição a mais que antes: o empurrão na tela provocava exatamente uma.
 *
 * Desde 2026-08-24 o robô APRENDE a chamada e a repete sozinho, em vez de cutucar a tela para que
 * ela a fizesse — porque o empurrão dependia de a aba estar VISÍVEL na VM.
 *
 * A rota não sabe disso e não deveria saber. Se um dia sair a credencial de integração, quem chama
 * passa a ser o worker, com o mesmo corpo — o contrato aqui é o retrato da frota, não o caminho por
 * onde ele veio.
 *
 * Autenticada pelo MESMO token dos outros dois robôs (`PORTAL_FEED_TOKEN`), comparado em tempo
 * constante e recusando-se a funcionar se estiver vazio: segredo ausente nunca pode significar
 * "aberto a todos". Um token com menos de 32 caracteres já desligou a alimentação inteira por seis
 * horas, em silêncio — a guarda de comprimento mora na rota do portal e a lição vale para todas.
 *
 * ── POR QUE O TOKEN PODE VIR NO CORPO ───────────────────────────────────────────────────────────
 *
 * Igual à oferta de spot: quem chama roda na origem do fornecedor, e um cabeçalho `Authorization`
 * transforma o POST em requisição "não simples", obrigando a um preflight que dependeria de o outro
 * lado abrir CORS. Com o token no corpo, a entrega sai na primeira tentativa. O cabeçalho continua
 * aceito para `curl` e para o dia em que o chamador não for um navegador.
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

    const body = fleetFeedBodySchema.parse(json);
    assertToken(request, body.token);

    /**
     * O pulso vai ANTES da gravação, e sem `await` no caminho crítico? Não: com `await`, e antes.
     *
     * Antes porque, se a gravação falhar, o pulso ainda é verdade — o robô rodou e levou aquele
     * tempo. Com `await` porque `recordRobotCycle` já engole os próprios erros: ela nunca derruba a
     * entrega, e um `void` aqui só esconderia a ordem de quem lê depois.
     */
    await recordRobotCycle({
      robot: "fleet",
      intervalMs: body.cicloMs ?? null,
      durationMs: body.duracaoMs ?? null,
    });

    const resultado = await recordFleetPositions(body.positions);
    /**
     * A resposta DIZ quantas placas o TMS não conhece, e devolve as primeiras.
     *
     * É informação de operação, não erro: são caminhões que o rastreador vê e a frota do TMS não
     * tem. O robô loga isso no console da VM, que é onde alguém olha quando desconfia. O corte em
     * dez existe para a resposta não virar uma lista de cem placas a cada cinco minutos.
     */
    return comCors(
      NextResponse.json({
        recebidas: resultado.recebidas,
        vinculadas: resultado.vinculadas,
        semCadastro: resultado.semCadastro.length,
        placasSemCadastro: resultado.semCadastro.slice(0, 10),
      }),
    );
  } catch (error) {
    return comCors(handleRouteError(error));
  }
}

/** O preflight, para quem mandar o token no cabeçalho. */
export function OPTIONS(): NextResponse {
  return comCors(new NextResponse(null, { status: 204 }));
}

/**
 * A resposta é legível de qualquer origem, e isso é deliberado: ela devolve contagens e placas da
 * própria frota de quem chamou — não há dado de terceiro aqui. O que protege a rota é o token.
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
