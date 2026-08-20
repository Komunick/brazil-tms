import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { db, spxRouterEvents } from "@brazil-tms/db";
import { POST } from "@/app/api/imports/spx-feed/route";

/**
 * A RESPOSTA da rota, verificada na fronteira HTTP.
 *
 * Aqui isso vale mais que de costume: o corpo `{"retcode": 0, "message": "success"}` não é uma
 * escolha nossa, é o que o documento da SPX manda responder. Se a rota devolver o formato das
 * NOSSAS outras rotas, cada entrega vira "falhou" do lado deles e a Shopee retenta em loop — sem
 * nenhum erro aparecer aqui. Um teste de unidade do JWT não pega isso.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const SEGREDO = "segredo-de-teste-do-agency-router";
/** Prefixo próprio: a limpeza do afterAll apaga por ele e nunca encosta em evento real. */
const PREFIXO = "teste-spx-";

function b64(objeto: unknown): string {
  return Buffer.from(JSON.stringify(objeto)).toString("base64url");
}

function tokenAssinado(traceId: string, segredo = SEGREDO): string {
  const h = b64({ account: "spx-basicserviceapi", alg: "HS256", typ: "JWT" });
  const c = b64({
    data: {
      trace_id: traceId,
      data_type: 2,
      agency_id: 1450,
      body: { content_data: { trip_number: "LT1O6J006ROW1", trip_status: 40 } },
    },
    timestamp: 1718795247,
  });
  return `${h}.${c}.${createHmac("sha256", segredo).update(`${h}.${c}`).digest("base64url")}`;
}

function post(corpo: unknown): Request {
  return new Request("http://localhost/api/imports/spx-feed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

describe.skipIf(!hasDb)("POST /api/imports/spx-feed", () => {
  beforeAll(() => {
    process.env.SPX_ROUTER_SECRET = SEGREDO;
  });
  afterEach(() => {
    process.env.SPX_ROUTER_SECRET = SEGREDO;
  });
  afterAll(async () => {
    await db.delete(spxRouterEvents).where(like(spxRouterEvents.traceId, `${PREFIXO}%`));
  });

  it("responde exatamente o corpo que a SPX espera", async () => {
    const res = await POST(post({ jwt: tokenAssinado(`${PREFIXO}${Date.now()}-a`) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ retcode: 0, message: "success" });
  });

  /**
   * Reentrega é o comportamento normal de quem empurra: se o remetente não viu a resposta, manda de
   * novo. Responder erro faria a Shopee retentar para sempre um evento que já está gravado.
   */
  it("responde sucesso na reentrega do mesmo trace_id", async () => {
    const trace = `${PREFIXO}${Date.now()}-repetido`;
    const primeira = await POST(post({ jwt: tokenAssinado(trace) }));
    const segunda = await POST(post({ jwt: tokenAssinado(trace) }));
    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(await segunda.json()).toEqual({ retcode: 0, message: "success" });
  });

  it("recusa assinatura feita com outro segredo", async () => {
    const res = await POST(post({ jwt: tokenAssinado(`${PREFIXO}intruso`, "outro-segredo") }));
    expect(res.status).toBe(401);
    expect((await res.json()).retcode).toBe(1);
  });

  it("recusa corpo sem jwt", async () => {
    const res = await POST(post({ data: "qualquer coisa" }));
    expect(res.status).toBe(400);
  });

  /** Segredo ausente jamais pode significar "aberto a todos" — a regra das outras rotas de ingestão. */
  it("fica desligada quando SPX_ROUTER_SECRET não está configurado", async () => {
    delete process.env.SPX_ROUTER_SECRET;
    const res = await POST(post({ jwt: tokenAssinado(`${PREFIXO}sem-segredo`) }));
    expect(res.status).toBe(503);
    expect((await res.json()).retcode).toBe(1);
  });
});
