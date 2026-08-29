import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * OS TRÊS CASOS DE CPF RESPONDEM BYTE A BYTE IGUAL — e é este arquivo que segura isso.
 *
 * CPF que não existe · CPF já na fila · CPF de motorista da empresa. Se a resposta distinguisse os
 * três, o formulário público viraria uma máquina de descobrir quem é motorista da Brazil
 * Transports: bastaria mandar CPFs e ler o que volta.
 *
 * ── SE ESTE TESTE CAIR, NÃO É ELE QUE ESTÁ ERRADO ─────────────────────────────────────────────
 *
 * Ele cai quando alguém acrescenta à resposta uma informação útil — "já estava na fila", "bem-vindo
 * de volta", um id. Cada uma dessas é razoável isoladamente e reabre o vazamento. A regra não é
 * disciplina de quem edita a rota daqui a um ano; é este arquivo.
 *
 * ── O QUE É MOCADO, E O QUE NÃO É ─────────────────────────────────────────────────────────────
 *
 * Só o STORAGE, que é a única dependência externa de verdade. Banco e rota são os reais: o valor do
 * teste está em exercitar o caminho inteiro, incluindo a decisão do caso do CPF, que é justamente o
 * que não pode vazar.
 */

vi.mock("@/lib/supabase/storage", () => ({
  putDocument: vi.fn(async () => undefined),
  removeObject: vi.fn(async () => undefined),
  documentsBucket: () => "documents",
  resourceDocumentStorageKey: (t: string, e: string, d: string, x: string) =>
    `resources/${t}/${e}/${d}.${x}`,
}));

const hasDb = Boolean(process.env.DATABASE_URL);
const ORIGEM = "https://braziltransports.com.br";

/** CPFs com dígito verificador válido — o esquema recusa qualquer coisa que não seja um CPF real. */
const CPF_NOVO = "39053344705";
const CPF_NA_FILA = "01932653546";
const CPF_DE_MOTORISTA = "15350946056";

function envio(cpf: string): Request {
  const form = new FormData();
  form.set("nome", "Motorista de Teste");
  form.set("cpf", cpf);
  form.set("celular", "71992067086");
  form.set("cep", "41770395");
  form.set("possuiMopp", "nao");
  form.set("possuiToxicologico", "nao");
  form.set("ciencia", "true");
  form.set("cnh", new File([new Uint8Array([1, 2, 3])], "cnh.jpg", { type: "image/jpeg" }));
  form.set(
    "comprovante",
    new File([new Uint8Array([4, 5, 6])], "comprovante.jpg", { type: "image/jpeg" }),
  );
  return new Request("http://localhost/api/publico/pre-cadastro", {
    method: "POST",
    headers: { origin: ORIGEM },
    body: form,
  });
}

describe.skipIf(!hasDb)("POST /api/publico/pre-cadastro — a resposta não distingue o CPF", () => {
  const criados: string[] = [];
  let motoristaId: string | null = null;

  beforeAll(async () => {
    process.env.PRE_CADASTRO_ORIGEM = ORIGEM;
    process.env.PRE_CADASTRO_ACTOR_EMAIL ??= "admin@braziltransports.com.br";

    const { db } = await import("@brazil-tms/db");
    const { drivers, driverPreregistrations } = await import("@brazil-tms/db/schema");

    // Caso 2: um CPF que JÁ tem pré-cadastro aberto.
    const [pre] = await db
      .insert(driverPreregistrations)
      .values({ cpf: CPF_NA_FILA, tipo: "novo" })
      .returning({ id: driverPreregistrations.id });
    if (pre) criados.push(pre.id);

    // Caso 3: um CPF que JÁ é motorista da empresa.
    const [d] = await db
      .insert(drivers)
      .values({ name: `Teste 028 ${randomUUID().slice(0, 8)}`, ownershipType: "owned", cpf: CPF_DE_MOTORISTA })
      .returning({ id: drivers.id });
    motoristaId = d?.id ?? null;
  });

  afterAll(async () => {
    const { db } = await import("@brazil-tms/db");
    const { drivers, driverPreregistrations, driverPreregistrationSubmissions, resourceDocuments } =
      await import("@brazil-tms/db/schema");
    const { inArray, eq } = await import("drizzle-orm");

    const todos = await db
      .select({ id: driverPreregistrations.id })
      .from(driverPreregistrations)
      .where(inArray(driverPreregistrations.cpf, [CPF_NOVO, CPF_NA_FILA, CPF_DE_MOTORISTA]));
    const ids = todos.map((t) => t.id);
    if (ids.length) {
      await db
        .delete(driverPreregistrationSubmissions)
        .where(inArray(driverPreregistrationSubmissions.preregistrationId, ids));
      await db.delete(driverPreregistrations).where(inArray(driverPreregistrations.id, ids));
    }
    await db.delete(resourceDocuments).where(eq(resourceDocuments.entityType, "preregistration"));
    if (motoristaId) await db.delete(drivers).where(eq(drivers.id, motoristaId));
  });

  it("os três casos devolvem o MESMO status e o MESMO corpo, byte a byte", async () => {
    const { POST } = await import("@/app/api/publico/pre-cadastro/route");

    const respostas = [];
    for (const cpf of [CPF_NOVO, CPF_NA_FILA, CPF_DE_MOTORISTA]) {
      const res = await POST(envio(cpf));
      respostas.push({ status: res.status, corpo: await res.text() });
    }

    const [a, b, c] = respostas;
    expect(a!.status).toBe(202);
    // Byte a byte, e não `toEqual` sobre o objeto: um campo a mais em ordem diferente passaria numa
    // comparação estrutural frouxa e continuaria sendo um canal.
    expect(b!.corpo).toBe(a!.corpo);
    expect(c!.corpo).toBe(a!.corpo);
    expect(b!.status).toBe(a!.status);
    expect(c!.status).toBe(a!.status);

    /*
     * ── E OS TRÊS CASOS FORAM MESMO TRÊS ──────────────────────────────────────────────────────
     *
     * Sem isto o teste passaria pelo motivo errado: se a semeadura falhasse em silêncio, os três
     * CPFs cairiam em "novo", as respostas seriam iguais por serem o MESMO caso, e o teste daria
     * verde enquanto a propriedade que ele existe para proteger nunca teria sido exercitada.
     *
     * A prova está do lado de dentro — onde a informação PODE existir, e de onde ela não sai.
     */
    const { db } = await import("@brazil-tms/db");
    const { driverPreregistrations, driverPreregistrationSubmissions } = await import(
      "@brazil-tms/db/schema"
    );
    const { inArray, eq, count } = await import("drizzle-orm");

    const linhas = await db
      .select({
        cpf: driverPreregistrations.cpf,
        tipo: driverPreregistrations.tipo,
        driverId: driverPreregistrations.driverId,
      })
      .from(driverPreregistrations)
      .where(inArray(driverPreregistrations.cpf, [CPF_NOVO, CPF_NA_FILA, CPF_DE_MOTORISTA]));
    const por = (cpf: string) => linhas.find((l) => l.cpf === cpf);

    expect(por(CPF_NOVO)?.tipo).toBe("novo");
    // O caso 3 reconheceu o motorista e amarrou nele — sem tocar em `drivers`.
    expect(por(CPF_DE_MOTORISTA)?.tipo).toBe("atualizacao");
    expect(por(CPF_DE_MOTORISTA)?.driverId).toBe(motoristaId);

    // O caso 2 ANEXOU: uma linha só na fila, com o envio pendurado nela. Se tivesse criado uma
    // segunda, o mesmo motorista apareceria duas vezes para conferir.
    expect(linhas.filter((l) => l.cpf === CPF_NA_FILA)).toHaveLength(1);
    const [envios] = await db
      .select({ n: count() })
      .from(driverPreregistrationSubmissions)
      // `criados[0]` é a linha semeada no `beforeAll`: o envio tem de ter sido pendurado NELA.
      .where(eq(driverPreregistrationSubmissions.preregistrationId, criados[0]!));
    expect(envios?.n).toBe(1);
  });

  it("o corpo não carrega nada além do recebido", async () => {
    const { POST } = await import("@/app/api/publico/pre-cadastro/route");
    const res = await POST(envio(CPF_NOVO));
    // Chaves fixas: qualquer acréscimo — id, tipo, mensagem — precisa passar por aqui primeiro.
    expect(Object.keys((await res.json()) as object)).toEqual(["recebido"]);
  });

  it("origem diferente é recusada antes de qualquer escrita", async () => {
    const { POST } = await import("@/app/api/publico/pre-cadastro/route");
    const req = new Request("http://localhost/api/publico/pre-cadastro", {
      method: "POST",
      headers: { origin: "https://site-qualquer.example" },
      body: new FormData(),
    });
    expect((await POST(req)).status).toBe(403);
  });
});
