import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  portalCommandPullSchema,
  portalCommandResultSchema,
  rotuloDoMotivo,
} from "@brazil-tms/shared";
import { encerrarOrdemDoPortal, pegarOrdensPendentes } from "@brazil-tms/db";
import { enfileirarPreSmSePrecisar } from "@/lib/pre-sm/queue";
import { Conflict, handleRouteError } from "@/lib/api/respond";
import { Unauthorized } from "@/lib/auth/require-auth";

export const dynamic = "force-dynamic";

/**
 * A BOCA DA FILA PARA O ROBÔ QUE ESCREVE NO PORTAL (2026-08-21).
 *
 * `POST` (sem `id`) — o robô pergunta "tem ordem para mim?" e recebe as pendentes JÁ MARCADAS como
 * pegas. Marcar na mesma ida é o que impede dois ciclos sobrepostos de mandarem o mesmo POST ao
 * fornecedor; ver `pegarOrdensPendentes`.
 *
 * `POST` (com `id`) — o robô relata o que o portal respondeu.
 *
 * ── POR QUE UM POST PARA PERGUNTAR ─────────────────────────────────────────────────────────────
 *
 * Porque perguntar MUDA o estado: a ordem sai de `pending` e entra em `sent`. Um GET que altera é
 * uma armadilha para o próximo que ler este arquivo — e para qualquer proxy que resolva repetir a
 * requisição por conta própria.
 *
 * Mesmo token dos outros robôs (`PORTAL_FEED_TOKEN`), no corpo pela mesma razão: quem chama roda na
 * origem do fornecedor, e um cabeçalho `Authorization` obrigaria a um preflight que dependeria de o
 * outro lado abrir CORS.
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

    // O relato traz `id`; o pedido de trabalho, não. É o que separa os dois caminhos.
    if ("id" in (json as Record<string, unknown>)) {
      const body = portalCommandResultSchema.parse(json);
      assertToken(request, body.token);
      const encerrada = await encerrarOrdemDoPortal({
        id: body.id,
        ok: body.ok,
        response: body.response,
        error: body.error ?? null,
      });
      /**
       * A PRÉ-SM É PEDIDA AQUI, e só quando `encerrada` é `true` (2026-08-25, fatia 026).
       *
       * Este é o único momento em que a atribuição existe dos DOIS lados: o portal confirmou. Antes
       * disso ele ainda pode recusar, e uma Pré-SM de atribuição recusada é escolta contratada para
       * viagem que ninguém vai fazer — paga, porque a gerenciadora cobra por solicitação.
       *
       * O `true` é a primeira barreira contra duplicata, e sai de graça: `encerrarOrdemDoPortal`
       * faz o `update` com `WHERE status = 'sent'`, então só UM relato do robô consegue encerrar a
       * ordem. Os repetidos devolvem `false` e não enfileiram nada.
       *
       * A segunda barreira é o índice único parcial em `trip_pre_sm`, que cobre o que sobra:
       * reinício do worker, reenfileiramento à mão, uma segunda ordem de `assign` na mesma viagem.
       *
       * `void` e `catch` vazio: a fila não pode derrubar o relato do robô. Se ele receber erro,
       * repete o relato — e aí é a ordem do portal que fica em risco, não a Pré-SM.
       */
      if (encerrada && body.ok) {
        void enfileirarPreSmSePrecisar(body.id).catch(() => {});
      }

      // `false` não é erro: é um relato de ordem que já havia sido encerrada. Dizer isso em vez de
      // fingir sucesso é o que permite ao robô parar de repetir.
      return comCors(NextResponse.json({ encerrada }));
    }

    const body = portalCommandPullSchema.parse(json);
    assertToken(request, body.token);
    const ordens = await pegarOrdensPendentes(body.limite ?? 5);
    return comCors(
      NextResponse.json({
        /**
         * O robô recebe só o que precisa para executar: o endereço no portal, a ação e o motivo.
         * Nada de id interno de viagem, nada de quem pediu — ele é burro de propósito, como os
         * outros dois, e o que não chega até lá não pode vazar de lá.
         */
        ordens: ordens.map((o) => ({
          id: o.id,
          portalTripId: o.portalTripId,
          externalTripId: o.externalTripId,
          action: o.action,
          reasonId: o.reasonId,
          reasonLabel: rotuloDoMotivo(o.reasonId),
          remark: o.remark,
          driverId: o.driverId,
          secondDriverId: o.secondDriverId,
          plates: o.plates,
        })),
      }),
    );
  } catch (error) {
    return comCors(handleRouteError(error));
  }
}

export function OPTIONS(): NextResponse {
  return comCors(new NextResponse(null, { status: 204 }));
}

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
