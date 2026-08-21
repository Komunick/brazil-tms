import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { recordRobotCycle } from "@brazil-tms/db";
import { Conflict, handleRouteError } from "@/lib/api/respond";
import { Unauthorized } from "@/lib/auth/require-auth";
import { ingestPortalDetail, ingestPortalFeed } from "@/lib/imports/portal-feed";

export const dynamic = "force-dynamic";

/**
 * POST /api/imports/portal-feed — the robot's endpoint (2026-08-16).
 *
 * A script running in a browser that is already logged into the customer's portal reads one page of
 * its API and forwards the answer here, verbatim. This is the only route in the app authenticated by
 * a SHARED TOKEN instead of a user session, because the caller is a machine with no login:
 *
 *   Authorization: Bearer <PORTAL_FEED_TOKEN>
 *
 * The token is compared in constant time, and the route refuses to run at all when it is unset — an
 * empty secret must never mean "open to everyone". There is no `view`/`GET` half: the endpoint
 * accepts data and returns a summary, nothing else.
 *
 * What the caller CANNOT do: choose what happens to a trip. The body is the portal's own payload,
 * treated as data; the mode says only WHICH LISTING it came from — Planejado, Aceito ou Concluído —
 * e o TMS decide o que cada uma pode fazer (`PortalFeedMode`).
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertFeedToken(request);

    const body = (await request.json().catch(() => null)) as {
      mode?: string;
      customerCode?: string;
      payload?: unknown;
      /** O pulso do robô (2026-08-21): opcional, para não quebrar quem ainda não foi atualizado. */
      cicloMs?: number;
      duracaoMs?: number;
    } | null;
    if (!body || typeof body !== "object") {
      throw new Conflict("INVALID_BODY", "Corpo inválido: envie JSON.");
    }

    const mode = body.mode;
    if (
      mode !== "plan" &&
      mode !== "in_progress" &&
      mode !== "execution" &&
      mode !== "history" &&
      mode !== "detail"
    ) {
      throw new Conflict(
        "MODE_REQUIRED",
        "Informe 'plan' (Planejado), 'in_progress' (Aceito), 'execution' (Concluído recente), 'history' (backfill do Concluído) ou 'detail' (uma viagem).",
      );
    }
    if (!body.payload || typeof body.payload !== "object") {
      throw new Conflict("NO_PAYLOAD", "Envie a resposta do portal em 'payload'.");
    }

    // The per-trip detail: fills who assigned the trip, nothing else. Answered separately because it
    // is a different portal endpoint with a different shape — and because it must never be able to
    // create or move a trip.
    if (mode === "detail") {
      const recorded = await ingestPortalDetail({
        payload: body.payload as { retcode?: number; data?: Record<string, unknown> },
        customerCode: body.customerCode?.trim() || "SHOPEE",
      });
      return NextResponse.json(recorded);
    }

    /**
     * O pulso é gravado por MODO — `portal_plan`, `portal_execution`, `portal_in_progress`.
     *
     * São três relógios independentes rodando na mesma aba, e um pode sufocar sem o outro. Um pulso
     * só, somando os três, esconderia justamente qual deles está atrasando.
     *
     * O modo `detail` fica de fora: ele não tem ciclo próprio, é uma busca que o modo `plan` dispara
     * quando falta informação de uma viagem.
     */
    await recordRobotCycle({
      robot: `portal_${mode}`,
      intervalMs: body.cicloMs ?? null,
      durationMs: body.duracaoMs ?? null,
    });

    const result = await ingestPortalFeed({
      payload: body.payload,
      mode,
      customerCode: body.customerCode?.trim() || "SHOPEE",
    });

    return NextResponse.json({
      batchId: result.batchId,
      mode: result.mode,
      trips: result.trips,
      legs: result.legs,
      plan: result.planSummary ? { ...result.planSummary, outcomes: undefined } : null,
      execution: result.summary ? { ...result.summary, outcomes: undefined } : null,
      unknownStations: result.unknownStations,
      rejected: result.rejected.length,
      // Quais viagens ainda estão sem o operador de atribuição. O robô busca o detalhe SÓ dessas —
      // sem este campo na resposta ele nunca pede nada, que foi exatamente o que aconteceu.
      needDetail: result.needDetail,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Constant-time bearer check. An unset token disables the endpoint rather than opening it. */
function assertFeedToken(request: Request): void {
  const expected = process.env.PORTAL_FEED_TOKEN ?? "";
  if (expected.length < 32) {
    throw new Unauthorized(
      "PORTAL_FEED_TOKEN ausente ou curto demais: alimentação automática desativada.",
    );
  }
  const header = request.headers.get("authorization") ?? "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  // Compare lengths first — timingSafeEqual throws on a mismatch — but still run the comparison so a
  // wrong-length token costs the same as a wrong one.
  const equal = a.length === b.length && timingSafeEqual(a, b);
  if (!equal) throw new Unauthorized("Token inválido.");
}
