import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Forbidden, Unauthorized } from "../auth/require-auth";

/** Business-rule conflicts (last-admin guard, duplicate email) → HTTP 409. */
export class Conflict extends Error {
  readonly status = 409;
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "Conflict";
  }
}

export function apiError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Maps known BFF errors to HTTP responses (401/403/409/400) with a generic 500 fallback.
 * A denied/failed request causes no state change (SC-003).
 */
export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof Unauthorized) return apiError(401, "UNAUTHORIZED", error.message);
  if (error instanceof Forbidden) return apiError(403, "FORBIDDEN", error.message);
  if (error instanceof Conflict) return apiError(409, error.code, error.message);
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Dados inválidos.", issues: error.flatten() } },
      { status: 400 },
    );
  }
  console.error("Unhandled route error:", error);
  return apiError(500, "INTERNAL", "Erro interno.");
}
