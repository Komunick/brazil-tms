import { type PgBoss } from "pg-boss";
import { marcarRetiradasDoPortal, resolvePortalActorId } from "@brazil-tms/db";
import { JOB, work } from "../../lib/queue";

/**
 * A varredura das viagens que o cliente RETIROU do portal (2026-08-18).
 *
 * O portal não avisa quando desiste de uma proposta: ela some do Planejado e pronto. Do lado de cá a
 * viagem seguia viva para sempre, cobrando atribuição e alertando. Foram duas limpezas manuais numa
 * noite — 60 viagens, depois mais 14 — antes de ficar claro que isto não é resíduo histórico: é o
 * funcionamento normal do portal, e acontece todo dia.
 *
 * A regra e as quatro travas moram em `marcarRetiradasDoPortal`; aqui só existe o relógio. Meia em
 * meia hora é folgado de propósito: o robô varre o Planejado a cada quinze minutos, e a ausência só
 * conta depois de três horas de silêncio. Nada aqui tem pressa — pressa, nesta varredura, é como se
 * cancela viagem viva.
 *
 * O que sai no log importa mais do que o normal: quando o TETO barra a varredura, ninguém é
 * cancelado e o número fica registrado. Essa linha é o pedido de socorro do dia em que o robô parar
 * ou o portal devolver página vazia.
 */
export async function runPortalWithdrawnSweep(): Promise<void> {
  const inicio = Date.now();
  const actorUserId = await resolvePortalActorId();
  const r = await marcarRetiradasDoPortal(actorUserId);

  if (r.barradoPeloTeto) {
    console.warn(
      JSON.stringify({
        job: JOB.portalWithdrawn,
        barradoPeloTeto: true,
        candidatas: r.candidatas,
        motivo:
          "retiradas demais de uma vez — nada foi cancelado. Confira se o robô do portal está rodando.",
        durationMs: Date.now() - inicio,
      }),
    );
    return;
  }

  console.log(
    JSON.stringify({
      job: JOB.portalWithdrawn,
      candidatas: r.candidatas,
      canceladas: r.canceladas,
      // As LHs vão no log porque uma viagem cancelada por ausência é a coisa que alguém vai querer
      // conferir no portal depois — e sem o número não há como.
      externalTripIds: r.externalTripIds,
      durationMs: Date.now() - inicio,
    }),
  );
}

export async function registerPortalWithdrawn(boss: PgBoss): Promise<void> {
  await work(boss, JOB.portalWithdrawn, async () => {
    await runPortalWithdrawnSweep();
  });
  const cron = process.env.PORTAL_WITHDRAWN_CRON ?? "*/30 * * * *";
  await boss.schedule(JOB.portalWithdrawn, cron, {}, {});
}
