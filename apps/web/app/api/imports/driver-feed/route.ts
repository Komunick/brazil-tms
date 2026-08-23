import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CAMPOS_REVELAVEIS, mapPortalDrivers, valorRevelado } from "@brazil-tms/shared";
import { applyDriverSensitive, applyPortalDrivers } from "@brazil-tms/db";
import { Conflict, handleRouteError } from "@/lib/api/respond";
import { Unauthorized } from "@/lib/auth/require-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/imports/driver-feed — o cadastro de motoristas do portal (2026-08-23, a pedido).
 *
 * Mesma porta dos outros robôs: quem chama é uma máquina sem login, autenticada pelo token
 * compartilhado, comparado em tempo constante e com a rota se recusando a rodar se ele não estiver
 * configurado — segredo vazio nunca pode significar "aberto a todos".
 *
 * ── DUAS FORMAS DE CORPO, E A RESPOSTA É QUEM DIRIGE O ROBÔ ───────────────────────────────────
 *
 * `{ page }` — uma página da listagem. O TMS grava o que dá e devolve `falta`: de quem ainda falta
 * telefone, nome ou CPF. É o mesmo desenho do `needDetail` das viagens, e é ele que impede o robô de
 * revelar 4.000 campos para reescrever o que já temos.
 *
 * `{ reveal }` — o valor de UM campo de UM motorista, que o portal só entrega um por vez.
 *
 * A revelação grava só onde o campo está VAZIO: entre o pedido e a resposta alguém pode ter digitado
 * à mão, e o que a pessoa digitou vale mais do que o que o fornecedor devolveu.
 */
const paginaSchema = z.object({
  token: z.string().optional(),
  page: z.unknown(),
});

const revelacaoSchema = z.object({
  token: z.string().optional(),
  reveal: z.object({
    portalDriverId: z.string().min(1),
    field: z.enum(CAMPOS_REVELAVEIS),
    payload: z.unknown(),
  }),
});

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

    if ("reveal" in (json as Record<string, unknown>)) {
      const body = revelacaoSchema.parse(json);
      assertToken(request, body.token);
      const valor = valorRevelado(body.reveal.payload);
      if (!valor) return NextResponse.json({ gravado: false, motivo: "vazio" });
      const gravado = await applyDriverSensitive(
        body.reveal.portalDriverId,
        body.reveal.field,
        valor,
      );
      return NextResponse.json({ gravado });
    }

    const body = paginaSchema.parse(json);
    assertToken(request, body.token);
    const motoristas = mapPortalDrivers(body.page);
    const { resumo, falta } = await applyPortalDrivers(motoristas);
    return NextResponse.json({ resumo, falta });
  } catch (error) {
    return handleRouteError(error);
  }
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
