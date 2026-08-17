import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { bscSnapshots } from "../../schema";

/**
 * O BSC do cliente: gravar o que ele publicou e devolver o mais recente de cada recorte.
 *
 * Este módulo não julga nem calcula nada. Ele guarda a nota que a Shopee deu e a entrega de volta com
 * a idade dela colada — porque a única forma de mostrar um número de ontem sem mentir é mostrar
 * quando ele é de ontem.
 */

/** Os três recortes que o robô captura numa passada. */
export const BSC_PERIODS = ["day", "week", "month"] as const;
export type BscPeriod = (typeof BSC_PERIODS)[number];

export interface BscSnapshotInput {
  period: BscPeriod;
  /** O rótulo exato do filtro ("1–16 ago") — a prova de qual recorte gerou estes números. */
  periodLabel: string | null;
  /** O "Atualizado em" do relatório, em ISO. */
  capturedAt: string;
  score: number | null;
  zone: string | null;
  /** Rótulo → percentual. Indicador em branco no BSC simplesmente não vem. */
  indicators: Record<string, number>;
}

export interface BscSnapshotView {
  period: BscPeriod;
  periodLabel: string | null;
  capturedAt: string;
  score: number | null;
  zone: string | null;
  indicators: Record<string, number>;
}

/**
 * Grava um snapshot. Reenviar o mesmo (período, carimbo) atualiza em vez de duplicar: o robô confere
 * o carimbo antes de mandar, mas a garantia mora aqui — um script que reinicia não pode sujar a série
 * histórica.
 *
 * Devolve se a linha é NOVA, para o robô poder registrar "nada mudou" em vez de anunciar trabalho.
 */
export async function saveBscSnapshot(input: BscSnapshotInput): Promise<{ isNew: boolean }> {
  const existing = await db
    .select({ id: bscSnapshots.id })
    .from(bscSnapshots)
    .where(
      and(
        eq(bscSnapshots.period, input.period),
        eq(bscSnapshots.capturedAt, new Date(input.capturedAt)),
      ),
    )
    .limit(1);

  await db
    .insert(bscSnapshots)
    .values({
      period: input.period,
      periodLabel: input.periodLabel,
      capturedAt: new Date(input.capturedAt),
      score: input.score == null ? null : String(input.score),
      zone: input.zone,
      indicators: input.indicators,
    })
    .onConflictDoUpdate({
      target: [bscSnapshots.period, bscSnapshots.capturedAt],
      set: {
        periodLabel: input.periodLabel,
        score: input.score == null ? null : String(input.score),
        zone: input.zone,
        indicators: input.indicators,
        receivedAt: new Date(),
      },
    });

  return { isNew: existing.length === 0 };
}

/**
 * O snapshot mais recente de cada recorte — o que o painel mostra.
 *
 * Um recorte que nunca chegou simplesmente não aparece, em vez de virar uma linha com traços: um
 * cartão que promete um número e mostra "—" é pior que um cartão que não promete.
 */
export async function queryLatestBsc(): Promise<BscSnapshotView[]> {
  const rows = await db
    .select({
      period: bscSnapshots.period,
      periodLabel: bscSnapshots.periodLabel,
      capturedAt: bscSnapshots.capturedAt,
      score: bscSnapshots.score,
      zone: bscSnapshots.zone,
      indicators: bscSnapshots.indicators,
      rank: sql<number>`row_number() over (
        partition by ${bscSnapshots.period} order by ${bscSnapshots.capturedAt} desc
      )`.as("rank"),
    })
    .from(bscSnapshots)
    .where(inArray(bscSnapshots.period, [...BSC_PERIODS]))
    .orderBy(desc(bscSnapshots.capturedAt));

  return rows
    .filter((r) => Number(r.rank) === 1)
    .map((r) => ({
      period: r.period as BscPeriod,
      periodLabel: r.periodLabel,
      capturedAt: r.capturedAt.toISOString(),
      score: r.score == null ? null : Number(r.score),
      zone: r.zone,
      indicators: (r.indicators ?? {}) as Record<string, number>,
    }));
}
