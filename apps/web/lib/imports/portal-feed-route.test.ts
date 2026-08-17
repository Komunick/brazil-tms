import { beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/imports/portal-feed/route";

/**
 * A RESPOSTA da rota, não só o serviço por trás dela.
 *
 * O serviço já devolvia `needDetail` e tinha teste; a rota esquecia de repassá-lo, e o robô — que só
 * conhece o JSON — nunca pedia detalhe de nada. Zero gravados, sem erro em lugar nenhum. Um teste de
 * serviço não pega isso: o que atravessa a fronteira HTTP precisa ser verificado na fronteira HTTP.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const TOKEN = "token-de-teste-com-pelo-menos-32-caracteres";

function post(body: unknown, token = TOKEN): Request {
  return new Request("http://localhost/api/imports/portal-feed", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!hasDb)("POST /api/imports/portal-feed", () => {
  beforeAll(() => {
    process.env.PORTAL_FEED_TOKEN = TOKEN;
    process.env.PORTAL_FEED_ACTOR_EMAIL = "admin@braziltransports.com.br";
  });

  it("devolve needDetail — é assim que o robô sabe de quem buscar o detalhe", async () => {
    const res = await POST(post({ mode: "plan", payload: { retcode: 0, data: { list: [] } } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("needDetail");
    expect(Array.isArray(body.needDetail)).toBe(true);
  });

  it("aceita o modo detail e responde o que fez", async () => {
    const res = await POST(
      post({
        mode: "detail",
        payload: {
          retcode: 0,
          data: {
            trip_number: "LH-QUE-NAO-EXISTE",
            trip_station: [{ assign_operator: "ninguem@exemplo.com" }],
          },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      externalTripId: "LH-QUE-NAO-EXISTE",
      recorded: false,
    });
  });

  it("aceita o modo in_progress (aba Aceito) e o trata como plano", async () => {
    // O robô manda de onde veio; quem decide o que a aba pode fazer é o TMS. A aba "Aceito" PODE
    // criar viagem — foi por não poder que 49 viagens em curso não existiam aqui.
    const res = await POST(
      post({ mode: "in_progress", payload: { retcode: 0, data: { list: [] } } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // `plan` preenchido e `execution` nulo é a prova de que caiu no caminho que cria.
    expect({ temPlano: body.plan !== null, temExecucao: body.execution !== null }).toEqual({
      temPlano: true,
      temExecucao: false,
    });
  });

  it("aceita o modo history (backfill do Concluído) e o trata como plano", async () => {
    // O TMS começa em 06/08 e o portal tem viagem desde 18/07. Este é o modo que traz o que falta —
    // criando, e fechando como Concluída/Cancelada sem entrar na fila do dinheiro.
    const res = await POST(post({ mode: "history", payload: { retcode: 0, data: { list: [] } } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect({ temPlano: body.plan !== null, temExecucao: body.execution !== null }).toEqual({
      temPlano: true,
      temExecucao: false,
    });
  });

  it("sem token não passa, e um modo inventado é recusado", async () => {
    const semToken = await POST(post({ mode: "plan", payload: {} }, "errado"));
    expect(semToken.status).toBe(401);

    const modoInvalido = await POST(post({ mode: "inventado", payload: {} }));
    expect(modoInvalido.status).toBe(409);
  });
});
