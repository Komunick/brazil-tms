import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SpxJwtInvalid, verifySpxJwt } from "./spx-jwt";

const SEGREDO = "5a95c73e6ae71ea9";

function b64(objeto: unknown): string {
  return Buffer.from(JSON.stringify(objeto)).toString("base64url");
}

function assinar(
  corpo: unknown,
  segredo = SEGREDO,
  cabecalho: unknown = { account: "spx-basicserviceapi", alg: "HS256", typ: "JWT" },
): string {
  const h = b64(cabecalho);
  const c = b64(corpo);
  const assinatura = createHmac("sha256", segredo).update(`${h}.${c}`).digest("base64url");
  return `${h}.${c}.${assinatura}`;
}

/** O exemplo de LH do documento "4PL access to SPX", seção 3.2. */
const CORPO_LH = {
  data: {
    trace_id: "SPXLHLT1O6J006ROW1014ee76c0953f867569e9f431c6cb59cb2",
    data_type: 2,
    agency_id: 21,
    body: {
      content_data: {
        trip_number: "LT1O6J006ROW1",
        trip_type: "By Land",
        trip_status: 40,
        vehicle_plate: "ABC1234",
      },
    },
  },
  timestamp: 1718795247,
};

describe("verifySpxJwt", () => {
  it("lê trace_id, data_type, agency_id e content_data de um token válido", () => {
    const claims = verifySpxJwt(assinar(CORPO_LH), SEGREDO);
    expect(claims.data.traceId).toBe(CORPO_LH.data.trace_id);
    expect(claims.data.dataType).toBe(2);
    expect(claims.data.agencyId).toBe("21");
    expect(claims.timestamp).toBe(1718795247);
    expect(claims.data.contentData).toMatchObject({ trip_number: "LT1O6J006ROW1" });
  });

  it("recusa assinatura feita com outro segredo", () => {
    expect(() => verifySpxJwt(assinar(CORPO_LH, "segredo-errado"), SEGREDO)).toThrow(SpxJwtInvalid);
  });

  it("recusa corpo adulterado depois de assinado", () => {
    const token = assinar(CORPO_LH);
    const [h, , s] = token.split(".");
    const outro = b64({ ...CORPO_LH, data: { ...CORPO_LH.data, agency_id: 9999 } });
    expect(() => verifySpxJwt(`${h}.${outro}.${s}`, SEGREDO)).toThrow(SpxJwtInvalid);
  });

  /**
   * A falha clássica de JWT: aceitar o `alg` que o próprio token declara. Se passasse, qualquer um
   * que descobrisse a URL entraria sem segredo nenhum.
   */
  it("recusa alg=none mesmo com assinatura vazia", () => {
    const h = b64({ alg: "none", typ: "JWT" });
    const c = b64(CORPO_LH);
    expect(() => verifySpxJwt(`${h}.${c}.`, SEGREDO)).toThrow(SpxJwtInvalid);
  });

  it("recusa token sem trace_id, que é a chave de idempotência", () => {
    const semTrace = { ...CORPO_LH, data: { ...CORPO_LH.data, trace_id: "" } };
    expect(() => verifySpxJwt(assinar(semTrace), SEGREDO)).toThrow(SpxJwtInvalid);
  });

  it("recusa token que não tem três partes", () => {
    expect(() => verifySpxJwt("abc.def", SEGREDO)).toThrow(SpxJwtInvalid);
  });

  /**
   * Push atrasado por fila do outro lado continua sendo evento real. A proteção contra reenvio é o
   * `trace_id` único na tabela, não uma janela de tempo que descartaria dado bom num dia ruim deles.
   */
  it("aceita timestamp antigo — quem protege contra reenvio é o trace_id", () => {
    const velho = { ...CORPO_LH, timestamp: 1600000000 };
    expect(verifySpxJwt(assinar(velho), SEGREDO).timestamp).toBe(1600000000);
  });
});
