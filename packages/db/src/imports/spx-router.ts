import { desc, sql } from "drizzle-orm";
import { db } from "../client";
import { spxRouterEvents } from "../../schema";

/**
 * O push da SPX, gravado (2026-08-20). Ver `schema/spx-router-events.ts` para o porquê de guardar
 * cru. Aqui ficam só as duas decisões: o que se extrai para coluna, e o que acontece na reentrega.
 */

export interface SpxRouterEventInput {
  traceId: string;
  dataType: number | null;
  agencyId: string | null;
  /** O `content_data` inteiro, como chegou. */
  payload: unknown;
  /** O `timestamp` que o remetente assinou, em segundos (unix). */
  signedAtUnix: number | null;
}

export interface SpxRouterEventResult {
  /** Falso quando o `trace_id` já existia — reentrega do mesmo evento, não erro. */
  gravado: boolean;
  tripNumber: string | null;
}

/**
 * As DUAS colunas que se extraem do payload, e por que só elas.
 *
 * `business_name` e `trip_number` são o que responde "o que chegou dessa viagem?" sem abrir o JSON.
 * Todo o resto — trajeto, horários, pacotes — fica dentro de `payload`, porque interpretar agora
 * seria escrever mapeamento contra exemplos de teste de abril de 2025.
 *
 * A extração é DEFENSIVA de propósito: se o campo não estiver onde o documento diz, a coluna fica
 * nula e a linha entra do mesmo jeito. Perder o evento inteiro porque o `trip_number` mudou de
 * lugar seria o pior desfecho possível para uma fonte que a gente ainda está aprendendo a ler.
 */
function extrair(payload: unknown): { businessName: string | null; tripNumber: string | null } {
  const raiz = (payload ?? {}) as Record<string, unknown>;
  const businessName = texto(raiz.business_name) ?? texto(raiz.business_type) ?? null;

  // LH põe os campos na raiz do `content_data`; FM e LM os põem sob `data`, que no LM é um array.
  const data = raiz.data;
  const primeiro = Array.isArray(data) ? data[0] : data;
  const interno = (primeiro ?? {}) as Record<string, unknown>;

  const tripNumber = texto(raiz.trip_number) ?? texto(interno.trip_number) ?? null;
  return { businessName, tripNumber };
}

function texto(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export async function recordSpxRouterEvent(
  entrada: SpxRouterEventInput,
): Promise<SpxRouterEventResult> {
  const { businessName, tripNumber } = extrair(entrada.payload);

  /**
   * `DO NOTHING` no `trace_id`, e a resposta ainda é sucesso.
   *
   * Reentrega é o comportamento normal de quem empurra: se o remetente não viu nosso `retcode 0`
   * — timeout, deploy no meio, rede — ele manda de novo. Recusar com erro faria a Shopee retentar
   * para sempre um evento que já está gravado.
   */
  const linhas = await db
    .insert(spxRouterEvents)
    .values({
      traceId: entrada.traceId,
      dataType: entrada.dataType,
      agencyId: entrada.agencyId,
      businessName,
      tripNumber,
      payload: entrada.payload as never,
      signedAt: paraUtc(entrada.signedAtUnix),
    })
    .onConflictDoNothing({ target: spxRouterEvents.traceId })
    .returning({ id: spxRouterEvents.id });

  return { gravado: linhas.length > 0, tripNumber };
}

/** Unix em segundos → Date. O documento é explícito: "Datetimes must be in unix time". */
function paraUtc(segundos: number | null): Date | null {
  if (segundos == null || !Number.isFinite(segundos) || segundos <= 0) return null;
  // Tolera milissegundos: um remetente que mande 1718795247000 ainda cai no ano certo.
  const ms = segundos > 1e11 ? segundos : segundos * 1000;
  return new Date(ms);
}

export interface SpxRouterPulse {
  total: number;
  ultimoRecebidoEm: string | null;
  ultimoTripNumber: string | null;
}

/** O pulso da fonte, para a tela de Status do Sistema: chegou alguma coisa, e quando. */
export async function querySpxRouterPulse(): Promise<SpxRouterPulse> {
  const [contagem] = await db.select({ total: sql<number>`count(*)::int` }).from(spxRouterEvents);
  const [ultimo] = await db
    .select({ receivedAt: spxRouterEvents.receivedAt, tripNumber: spxRouterEvents.tripNumber })
    .from(spxRouterEvents)
    .orderBy(desc(spxRouterEvents.receivedAt))
    .limit(1);

  return {
    total: contagem?.total ?? 0,
    ultimoRecebidoEm: ultimo?.receivedAt?.toISOString() ?? null,
    ultimoTripNumber: ultimo?.tripNumber ?? null,
  };
}
