import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { Conflict, handleRouteError } from "@/lib/api/respond";
import { Unauthorized } from "@/lib/auth/require-auth";
import { ingestPortalFeed } from "@/lib/imports/portal-feed";

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
 * treated as data; the mode (plan/execution) selects which of the two existing import behaviours
 * runs, exactly as the operator's toggle does on the upload screen.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertFeedToken(request);

    const body = (await request.json().catch(() => null)) as {
      mode?: string;
      customerCode?: string;
      payload?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      throw new Conflict("INVALID_BODY", "Corpo inválido: envie JSON.");
    }

    const mode = body.mode;
    if (mode !== "plan" && mode !== "execution") {
      throw new Conflict(
        "MODE_REQUIRED",
        "Informe 'plan' (aba Planejado) ou 'execution' (aba Concluído).",
      );
    }
    if (!body.payload || typeof body.payload !== "object") {
      throw new Conflict("NO_PAYLOAD", "Envie a resposta do portal em 'payload'.");
    }

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
