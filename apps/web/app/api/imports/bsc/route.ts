import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { Conflict, handleRouteError } from "@/lib/api/respond";
import { Unauthorized } from "@/lib/auth/require-auth";
import { ingestBscSnapshot } from "@/lib/imports/bsc-feed";

export const dynamic = "force-dynamic";

/**
 * POST /api/imports/bsc — a porta do scorecard do cliente (2026-08-17).
 *
 * Um script lê o relatório da Shopee (que não tem API) e entrega os números daqui. Autenticado pelo
 * MESMO token do robô do portal, e pela mesma razão: o caller é uma máquina sem login. Compara em
 * tempo constante e recusa a rota inteira quando o token não está posto — segredo vazio nunca pode
 * significar "aberto".
 *
 * O que o caller NÃO pode fazer: mandar um número sem dizer de que período e de que horário ele é.
 * Toda a desconfiança está em `ingestBscSnapshot`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertFeedToken(request);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      throw new Conflict("INVALID_BODY", "Corpo inválido: envie JSON.");
    }

    const resultado = await ingestBscSnapshot(body);
    return NextResponse.json(resultado);
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Constant-time bearer check. An unset token disables the endpoint rather than opening it. */
function assertFeedToken(request: Request): void {
  const expected = process.env.PORTAL_FEED_TOKEN ?? "";
  if (expected.length < 32) {
    throw new Unauthorized("PORTAL_FEED_TOKEN ausente ou curto demais: alimentação desativada.");
  }
  const header = request.headers.get("authorization") ?? "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  const equal = a.length === b.length && timingSafeEqual(a, b);
  if (!equal) throw new Unauthorized("Token inválido.");
}
