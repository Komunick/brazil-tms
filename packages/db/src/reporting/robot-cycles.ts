import { desc, sql } from "drizzle-orm";
import { db } from "../client";
import { robotCycles } from "../../schema";

/**
 * O pulso de cada robô: o intervalo prometido e o que ele está cumprindo (2026-08-21).
 *
 * Ver `schema/robot-cycles.ts` para o porquê. Aqui ficam as duas operações: gravar o ciclo que
 * acabou e devolver o retrato de todos.
 */

export interface RobotCycleInput {
  robot: string;
  /** O intervalo configurado no robô, em ms. */
  intervalMs?: number | null;
  /** Quanto o ciclo que acabou levou, em ms. */
  durationMs?: number | null;
}

export interface RobotCycleView {
  robot: string;
  intervalMs: number | null;
  durationMs: number | null;
  receivedAt: string;
}

/**
 * Grava o pulso, sobrescrevendo o anterior daquele robô.
 *
 * NUNCA falha a entrega por causa disto. Quem chama é a rota de ingestão, e o pulso é informação
 * SOBRE a entrega — deixar um erro aqui derrubar o lote de viagens seria trocar o dado que importa
 * pelo dado que só serve para vigiar. O erro vai para o console e a vida segue.
 */
export async function recordRobotCycle(entrada: RobotCycleInput): Promise<void> {
  const robot = entrada.robot.trim();
  if (robot === "") return;
  try {
    await db
      .insert(robotCycles)
      .values({
        robot,
        intervalMs: inteiro(entrada.intervalMs),
        durationMs: inteiro(entrada.durationMs),
        receivedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: robotCycles.robot,
        set: {
          intervalMs: inteiro(entrada.intervalMs),
          durationMs: inteiro(entrada.durationMs),
          receivedAt: new Date(),
        },
      });
  } catch (error) {
    console.error("[robot-cycles] não foi possível gravar o pulso de", robot, error);
  }
}

/** Milissegundos negativos ou absurdos não entram: relógio torto não vira alarme. */
function inteiro(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v < 0 || v > 24 * 60 * 60 * 1000) return null;
  return Math.round(v);
}

/** O retrato de todos os robôs, o mais recente primeiro. */
export async function queryRobotCycles(): Promise<RobotCycleView[]> {
  const linhas = await db
    .select({
      robot: robotCycles.robot,
      intervalMs: robotCycles.intervalMs,
      durationMs: robotCycles.durationMs,
      receivedAt: robotCycles.receivedAt,
    })
    .from(robotCycles)
    .orderBy(desc(robotCycles.receivedAt));
  return linhas.map((l) => ({
    robot: l.robot,
    intervalMs: l.intervalMs,
    durationMs: l.durationMs,
    receivedAt: l.receivedAt.toISOString(),
  }));
}

/** Quantos robôs estão levando MAIS que o intervalo prometido — o número que a tela destaca. */
export async function countRobotsSufocando(): Promise<number> {
  const [linha] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(robotCycles)
    .where(sql`${robotCycles.durationMs} > ${robotCycles.intervalMs}`);
  return linha?.n ?? 0;
}
