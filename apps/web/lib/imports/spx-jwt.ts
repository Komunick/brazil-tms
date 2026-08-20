import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A ASSINATURA DO AGENCY ROUTER, conferida (2026-08-20).
 *
 * O corpo que a SPX manda é `{"jwt": "<header>.<payload>.<assinatura>"}`, HS256, com o segredo que
 * eles cadastram para a nossa agência. Não há biblioteca de JWT no repositório e não se acrescenta
 * uma por quinze linhas de HMAC: `node:crypto` faz exatamente isto, e a regra dos ≥3 usos ainda não
 * foi atingida por um formato que só esta rota lê.
 *
 * O que se confere, e o que deliberadamente não se confere:
 *
 * • ASSINATURA, sempre, em tempo constante. É a única coisa que separa a Shopee de qualquer um que
 *   descubra a URL — a rota é pública por necessidade, então o segredo é a porta inteira.
 * • `alg` tem que ser HS256 declarado por NÓS, não aceito do cabeçalho. Aceitar o `alg` que o
 *   token traz é a falha clássica: um token com `"alg":"none"` passaria sem assinatura nenhuma.
 * • NÃO se rejeita por `timestamp` velho. Um push atrasado por fila do outro lado continua sendo um
 *   evento real que queremos gravar, e a proteção contra reenvio é o `trace_id` único na tabela,
 *   não uma janela de tempo que descartaria dado bom num dia de lentidão deles.
 */

export interface SpxJwtClaims {
  timestamp: number | null;
  data: {
    traceId: string;
    dataType: number | null;
    agencyId: string | null;
    contentData: unknown;
  };
}

export class SpxJwtInvalid extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "SpxJwtInvalid";
  }
}

function base64UrlParaBuffer(parte: string): Buffer {
  return Buffer.from(parte.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function jsonDaParte(parte: string, nome: string): Record<string, unknown> {
  try {
    const bruto = JSON.parse(base64UrlParaBuffer(parte).toString("utf8")) as unknown;
    if (!bruto || typeof bruto !== "object") throw new Error("não é objeto");
    return bruto as Record<string, unknown>;
  } catch {
    throw new SpxJwtInvalid(`Não foi possível ler o ${nome} do token.`);
  }
}

export function verifySpxJwt(token: string, segredo: string): SpxJwtClaims {
  const partes = token.split(".");
  if (partes.length !== 3) throw new SpxJwtInvalid("Token não tem três partes.");
  // Índices explícitos porque `noUncheckedIndexedAccess` não enxerga a garantia do length acima.
  const cabecalhoB64 = partes[0] ?? "";
  const corpoB64 = partes[1] ?? "";
  const assinaturaB64 = partes[2] ?? "";

  const cabecalho = jsonDaParte(cabecalhoB64, "cabeçalho");
  // O `alg` vem do token, mas quem manda é a nossa expectativa: aceitar o que ele declara é como
  // perguntar ao visitante se ele tem a chave.
  if (cabecalho.alg !== "HS256") {
    throw new SpxJwtInvalid(`Algoritmo não suportado: ${String(cabecalho.alg)}.`);
  }

  const esperada = createHmac("sha256", segredo).update(`${cabecalhoB64}.${corpoB64}`).digest();
  const recebida = base64UrlParaBuffer(assinaturaB64);
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) {
    throw new SpxJwtInvalid("Assinatura inválida.");
  }

  const corpo = jsonDaParte(corpoB64, "corpo");
  const data = (corpo.data ?? {}) as Record<string, unknown>;
  const body = (data.body ?? {}) as Record<string, unknown>;

  const traceId = typeof data.trace_id === "string" ? data.trace_id.trim() : "";
  if (traceId === "") throw new SpxJwtInvalid("Token sem trace_id.");

  return {
    timestamp: numero(corpo.timestamp),
    data: {
      traceId,
      dataType: numero(data.data_type),
      // `agency_id` aparece como número nos exemplos de LH e como texto em outros; guardamos texto.
      agencyId:
        typeof data.agency_id === "string"
          ? data.agency_id.trim() || null
          : typeof data.agency_id === "number"
            ? String(data.agency_id)
            : null,
      contentData: body.content_data ?? null,
    },
  };
}

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}
