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
 * A regra e as cinco travas moram em `marcarRetiradasDoPortal`; aqui só existe o relógio. Meia em
 * meia hora é folgado de propósito: o robô varre o Planejado a cada quinze minutos, e a ausência só
 * conta depois de três horas de silêncio. Nada aqui tem pressa — pressa, nesta varredura, é como se
 * apaga viagem viva.
 *
 * O que sai no log importa mais do que o normal, porque a linha do banco não existe mais para ser
 * consultada. As LHs removidas vão inteiras, e o dia em que o robô parar aparece como `barradoPeloFeed`.
 */
export async function runPortalWithdrawnSweep(): Promise<void> {
  const inicio = Date.now();
  const actorUserId = await resolvePortalActorId();
  const r = await marcarRetiradasDoPortal(actorUserId);

  if (r.barradoPeloFeed) {
    console.warn(
      JSON.stringify({
        job: JOB.portalWithdrawn,
        barradoPeloFeed: true,
        candidatas: r.candidatas,
        motivo:
          "o robô do portal não carimbou viagens na última hora — ausência não prova nada nesse estado. Nada foi removido.",
        durationMs: Date.now() - inicio,
      }),
    );
    return;
  }

  console.log(
    JSON.stringify({
      job: JOB.portalWithdrawn,
      candidatas: r.candidatas,
      removidas: r.removidas,
      // Quando sobra fila, ela drena na varredura seguinte — o teto limita o trabalho de um ciclo,
      // não decide se o ciclo acontece. Uma pilha travada foi o defeito da primeira versão.
      limitadoPeloTeto: r.limitadoPeloTeto,
      // As LHs vão no log porque a linha do banco deixou de existir: este é o único lugar, junto com
      // a auditoria, onde alguém acha o número para conferir no portal depois.
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
