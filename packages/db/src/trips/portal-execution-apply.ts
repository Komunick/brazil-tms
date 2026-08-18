import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  TRIP_STATUSES,
  hopsToApply,
  milestonesFor,
  type PortalTrip,
  type TripStatus,
} from "@brazil-tms/shared";
import { db } from "../client";
import { locations, tripAssignments, tripEvents, trips } from "../../schema";
import { writeAudit } from "../audit/write-audit";
import { recomputeTripSla } from "./sla";
import { markCompleted } from "./completion";
import { writePortalFacts } from "./portal-trip-facts";
import { linkFleetFromPortal } from "./portal-fleet-link";
import { advanceTripFromSource, closeTripFromSource } from "./source-status";
import { marcarVistasNoPortal } from "./portal-withdrawn";

/** A palavra do cliente para uma viagem que não vai acontecer. Uma só, e comparada do mesmo jeito
 *  nos dois caminhos — o do plano e este. */
export function isCancelledAtPortal(status: string | null): boolean {
  return (status ?? "").trim().toLowerCase() === "cancelled";
}

/**
 * Writing the customer's portal execution onto trips the TMS already has (2026-08-16).
 *
 * The plan comes from the planning import; this only records WHAT HAPPENED — arrival, departure,
 * arrival at the destination — with the instants the customer's own system recorded. It is the step
 * that lets the trip timeline stop being a list of things people typed.
 *
 * Four rules, and each exists because the alternative is worse than doing nothing:
 *
 *  - IT NEVER CREATES A TRIP. A portal row for a trip the TMS does not know is reported, not
 *    invented: the plan (customer, lane, windows) belongs to the planning import, and a trip
 *    conjured from an execution row would have no plan to be measured against.
 *  - FORWARD ONLY. A trip already further along is left alone, so re-importing last week's export
 *    is a no-op instead of dragging trips backwards over work done here.
 *  - NO INVENTED TIMES. A hop the portal did not time (`confirmed`, on the way to `at_origin`)
 *    is written with a NULL timestamp. Only what the customer recorded carries an instant.
 *  - IDEMPOTENT PER EVENT. The same instant for the same trip and event is written once, so
 *    importing the same file twice does not double the timeline.
 */

export interface PortalApplyOutcome {
  externalTripId: string;
  legNumber: number;
  status:
    | "applied"
    | "not_found"
    | "already_ahead"
    | "no_milestones"
    | "unknown_station"
    | "closed"
    // The customer reported the trip finished and the TMS closed it — or could not, and says why.
    | "completed"
    | "completion_blocked";
  detail?: string;
  hops?: TripStatus[];
}

export interface PortalApplySummary {
  applied: number;
  notFound: number;
  alreadyAhead: number;
  noMilestones: number;
  unknownStation: number;
  closed: number;
  completed: number;
  completionBlocked: number;
  outcomes: PortalApplyOutcome[];
}

const TERMINAL = new Set<TripStatus>(["completed", "cancelled", "billed", "disputed"]);

/** The customer's station ids → the TMS locations they stand for, for one customer. */
export async function loadStationMap(customerId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: locations.id, externalStationId: locations.externalStationId })
    .from(locations)
    .where(and(eq(locations.customerId, customerId), isNull(locations.archivedAt)));
  const map = new Map<string, string>();
  for (const r of rows) if (r.externalStationId) map.set(r.externalStationId, r.id);
  return map;
}

/**
 * Apply one portal trip's legs. Each leg is matched to the TMS trip by (customer, external id, leg)
 * — the same key the planning import uses, so a milk run's second movement lands on its own trip.
 */
export interface PortalApplyOptions {
  /**
   * O que fazer quando o cliente diz "Completed" (2026-08-17).
   *
   *   `billing`     — o caminho normal: conclui, avança para faturamento pendente e cria o item.
   *                   É o certo para a viagem que o TMS acompanhou acontecer.
   *   `close_only`  — conclui e PARA. É o certo para o backfill do histórico: são viagens que
   *                   rodaram antes de o TMS existir e foram cobradas por fora. Criar item de
   *                   faturamento para elas faria dinheiro aparecer duas vezes, e isso não se
   *                   desfaz com um clique.
   */
  onCompleted?: "billing" | "close_only";
}

export async function applyPortalTrip(
  customerId: string,
  portal: PortalTrip,
  stationMap: Map<string, string>,
  actorUserId: string,
  sourceLabel: string,
  options: PortalApplyOptions = {},
): Promise<PortalApplyOutcome[]> {
  const out: PortalApplyOutcome[] = [];
  const onCompleted = options.onCompleted ?? "billing";

  for (const leg of portal.legs) {
    const base = { externalTripId: portal.externalTripId, legNumber: leg.legNumber };

    // Both ends must be sites the TMS knows — an unresolved station means we cannot even be sure
    // this is the same movement.
    const originId = leg.origin.stationId ? stationMap.get(leg.origin.stationId) : undefined;
    const destinationId = leg.destination.stationId
      ? stationMap.get(leg.destination.stationId)
      : undefined;
    if (!originId || !destinationId) {
      out.push({
        ...base,
        status: "unknown_station",
        detail: !originId ? leg.origin.stationValue : leg.destination.stationValue,
      });
      continue;
    }

    /**
     * A viagem é procurada ANTES da guarda de marcos (2026-08-17).
     *
     * Estava depois, e essa ordem engoliu a correção do cancelamento inteira: a viagem cancelada
     * ANTES DE SAIR — que é o caso mais comum de cancelamento — não tem horário real nenhum, cai em
     * `no_milestones` e sai do laço sem nunca chegar na checagem de cancelamento.
     *
     * Medido na `LT0Q8H02E2LD1`: cancelada no portal, sem chegada, sem carga, sem partida, só com
     * "Em fila" preenchido (campo que não é marco). No TMS ela seguia em "Recebida", alertando, e
     * aparecia como `no_milestones` em todo ciclo — um contador teimoso que era o defeito reclamando
     * sem ninguém entender.
     *
     * Custa uma consulta por perna sem marco. É o preço de a palavra final do cliente ser lida antes
     * de qualquer atalho de performance.
     */
    const milestones = milestonesFor(leg);

    const existing = (
      await db
        .select({
          id: trips.id,
          currentStatus: trips.currentStatus,
          customerFields: trips.customerFields,
          customerPriceCents: trips.customerPriceCents,
        })
        .from(trips)
        .where(
          and(
            eq(trips.customerId, customerId),
            eq(trips.externalTripId, portal.externalTripId),
            eq(trips.legNumber, leg.legNumber),
          ),
        )
        .limit(1)
    )[0];

    if (!existing) {
      out.push({ ...base, status: "not_found" });
      continue;
    }

    /**
     * QUEM DIRIGIU é registrado antes de qualquer guarda (2026-08-18).
     *
     * Estava depois de três `continue` — o de viagem terminal, o de cancelamento e o de "sem marco"
     * — e o primeiro deles sozinho custava 121 viagens concluídas com motorista e placa no portal e
     * nenhuma atribuição no TMS. A viagem fechava antes de o robô conseguir ligar a frota, e a porta
     * nunca mais abria: o portal continua mandando a linha todo ciclo, e todo ciclo ela batia no
     * mesmo `continue`.
     *
     * "Encerrada não recebe mais nada" confundia duas coisas diferentes. Não mover uma viagem
     * fechada está certo — reabrir o que acabou seria falsear a linha do tempo. Mas registrar quem a
     * dirigiu não a move: `mirrorAssignmentFromPortal` grava a atribuição sem tocar no status, e o
     * item de faturamento não lê a atribuição, então não há centavo em jogo.
     *
     * Cancelada continua de fora, e de propósito: numa viagem que não rodou, `assignTrip` moveria uma
     * "Recebida" para "Atribuída" segundos antes de cancelá-la — barulho pelo qual ninguém pediu.
     */
    if (!isCancelledAtPortal(portal.status)) {
      await linkFleetFromPortal(existing.id, portal, actorUserId);
    }

    // Uma viagem encerrada não recebe mais MARCO: mover o que já acabou seria reescrever a linha do
    // tempo. O vínculo de frota acima é outra coisa — é registro do que já aconteceu.
    if (TERMINAL.has(existing.currentStatus as TripStatus)) {
      out.push({ ...base, status: "closed", detail: existing.currentStatus });
      continue;
    }

    /**
     * Quem está nesta viagem, ANTES de movê-la (2026-08-16).
     *
     * A ordem não é detalhe: `assignTrip` só aceita viagem em "Recebida", então aplicar os marcos
     * primeiro fecharia a porta do vínculo para sempre. E isto precisa acontecer aqui, não só no
     * plano, porque uma viagem some do Planejado assim que é aceita — a aba "Aceito" é execução, e é
     * onde as 73 viagens em curso viviam invisíveis, sem motorista e sem placa no TMS.
     *
     * Nada disso cria viagem: só preenche o que o cliente diz sobre uma que já existe.
     */
    await writePortalFacts(
      existing.id,
      portal,
      existing.customerFields,
      existing.customerPriceCents,
    );

    /**
     * O cliente CANCELOU (2026-08-17).
     *
     * Este caminho não sabia cancelar — só o do plano sabia — e o efeito era pior do que não fazer
     * nada nos dois formatos que um cancelamento tem:
     *
     *   COM linha do tempo (chegou, carregou, e aí foi cancelada): os marcos a empurravam para "em
     *   trânsito" como se estivesse rodando. Ficava viva no quadro, viva no painel da parede,
     *   alertando — e nunca se resolvia, porque concluir exige que o portal diga "Completed" e uma
     *   cancelada nunca diz.
     *
     *   SEM linha do tempo (cancelada antes de sair, que é o caso mais comum): nem chegava aqui. A
     *   guarda de marcos ficava na frente e a viagem saía do laço como `no_milestones`, seguindo em
     *   "Recebida" e alertando para sempre.
     *
     * Vem ANTES dos marcos, e agora antes da guarda deles também: cancelar é a palavra final do
     * cliente sobre a viagem, e nenhum atalho pode passar na frente dela.
     */
    if (isCancelledAtPortal(portal.status)) {
      const fechou = await closeTripFromSource(existing.id, "CANCELADA", actorUserId, sourceLabel);
      out.push({
        ...base,
        status: fechou === "closed" ? "closed" : "already_ahead",
        detail: "cancelada no portal",
      });
      continue;
    }

    // Só agora a ausência de marco vira um resultado: não há o que aplicar, e o cliente não disse
    // nada que encerre a viagem.
    if (milestones.length === 0) {
      out.push({ ...base, status: "no_milestones" });
      continue;
    }

    /**
     * A palavra do portal sobre o FIM da viagem não depende de esta leitura ter movido alguma coisa.
     *
     * Custou 11 viagens presas em aberto com o portal dizendo Completed — seis em "Descarregando",
     * três em "No destino", uma em trânsito e uma descarregada. Duas armadilhas somadas, e as duas
     * pela mesma raiz: o fechamento estava amarrado ao MOVIMENTO daquela rodada, não ao ESTADO.
     *
     *   O `continue` abaixo saía da viagem inteira quando não havia salto novo. Uma viagem que
     *   chegou a `unloaded` numa leitura anterior nunca mais era considerada: no ciclo seguinte não
     *   há salto, e o fechamento ficava do outro lado de um `continue`.
     *
     *   E a condição de fechar exigia que ESTA rodada terminasse exatamente em `unloaded`. Quando o
     *   portal não informa a hora do descarregamento — o caso das seis paradas em "Descarregando" —
     *   nenhuma rodada termina ali, e a viagem ficava aberta para sempre, cobrando atribuição e
     *   alertando semanas depois de entregue.
     */
    const fechar = isCompletedAtPortal(portal.status);
    let tripId: string | null = null;
    let statusFinal = existing.currentStatus as TripStatus;
    const hops = hopsToApply(existing.currentStatus as TripStatus, milestones);
    if (hops.length === 0) {
      // "Já está adiante" continua sendo verdade e continua sendo relatado — o que ele não pode mais
      // fazer é interromper o processamento antes do fechamento.
      out.push({ ...base, status: "already_ahead", detail: existing.currentStatus });
      if (!fechar) continue;
      tripId = existing.id;
    } else {
      await db.transaction(async (tx) => {
        // Re-read under lock: between the read above and here, a dispatcher may have moved this trip.
        const locked = (
          await tx
            .select({ currentStatus: trips.currentStatus })
            .from(trips)
            .where(eq(trips.id, existing.id))
            .for("update")
            .limit(1)
        )[0]!;
        const from = locked.currentStatus as TripStatus;
        const fresh = hopsToApply(from, milestones);
        if (fresh.length === 0) {
          // Alguém moveu a viagem entre a leitura de fora e este lock. Não há salto a aplicar, mas o
          // fechamento continua valendo pelo ESTADO — sair daqui sem `tripId` reintroduziria, numa
          // corrida rara, exatamente o defeito que o comentário lá em cima descreve.
          statusFinal = from;
          tripId = existing.id;
          out.push({ ...base, status: "already_ahead", detail: from });
          return;
        }

        // Which (event type, instant) pairs this trip already carries — the idempotency guard that
        // makes re-importing the same export write nothing.
        const already = await tx
          .select({ eventType: tripEvents.eventType, eventTimestamp: tripEvents.eventTimestamp })
          .from(tripEvents)
          .where(eq(tripEvents.tripId, existing.id));
        const seen = new Set(
          already
            .filter((e) => e.eventTimestamp != null)
            .map((e) => `${e.eventType}@${e.eventTimestamp!.getTime()}`),
        );

        let before = from;
        const written: TripStatus[] = [];
        for (const hop of fresh) {
          await tx.insert(tripEvents).values({
            tripId: existing.id,
            eventType: "status_change",
            statusBefore: before,
            statusAfter: hop.status,
            eventTimestamp: hop.at,
            source: "import",
            actorUserId,
            notes: `Execução registrada pelo cliente (${sourceLabel}).`,
          });
          // The milestone event itself, with its real instant — skipped when already recorded.
          if (hop.eventType && hop.at && !seen.has(`${hop.eventType}@${hop.at.getTime()}`)) {
            await tx.insert(tripEvents).values({
              tripId: existing.id,
              eventType: hop.eventType,
              statusBefore: before,
              statusAfter: hop.status,
              eventTimestamp: hop.at,
              source: "import",
              actorUserId,
              notes: `Horário real informado pelo cliente (${sourceLabel}).`,
            });
          }
          before = hop.status;
          written.push(hop.status);
        }

        const target = written[written.length - 1]!;
        await tx
          .update(trips)
          .set({ currentStatus: target, updatedAt: new Date() })
          .where(eq(trips.id, existing.id));

        /**
         * A confirmação, carimbada pela realidade (2026-08-16).
         *
         * O aviso "confirmação pendente" olha o carimbo na atribuição, não o status da viagem. E o
         * carimbo só existia quando alguém clicava "Confirmar" no TMS — cerimônia que o caminho do
         * portal atravessa sem parar. Resultado medido: 9 avisos de confirmação pendente acesos em
         * viagens que já estavam CARREGANDO, e sem como apagar, porque a confirmação que faltava já
         * tinha acontecido no mundo.
         *
         * O caminhão chegou na origem. Isso responde a pergunta com mais força do que um clique.
         */
        if (TRIP_STATUSES.indexOf(target) > TRIP_STATUSES.indexOf("confirmed")) {
          // O instante é o primeiro horário REAL desta rodada — a chegada na origem, quase sempre.
          // Sem nenhum (só saltos sem hora), fica agora: o carimbo é verdadeiro, a hora é aproximada.
          const quando = fresh.find((h) => h.at != null)?.at ?? new Date();
          await tx
            .update(tripAssignments)
            .set({ confirmedByUserId: actorUserId, confirmedAt: quando, updatedAt: new Date() })
            .where(
              and(
                eq(tripAssignments.tripId, existing.id),
                eq(tripAssignments.isCurrent, true),
                isNull(tripAssignments.confirmedAt),
              ),
            );
        }

        await writeAudit(tx, {
          entityType: "trip",
          entityId: existing.id,
          action: "trip.status_change",
          previousValue: { current_status: from },
          newValue: { current_status: target, hops: written },
          actorUserId,
          reason: `Execução do portal do cliente (${sourceLabel}).`,
        });

        await recomputeTripSla(tx, existing.id);
        out.push({ ...base, status: "applied", hops: written });
        statusFinal = target;
        tripId = existing.id;
      });
    }

    // The customer says the trip is over: close it (2026-08-16, corrigido em 2026-08-18).
    //
    // Left open, a trip sat at `at_destination` forever — on tmsdev that was 244 of them, each still
    // demanding a resource assignment weeks after it had been delivered, and NONE of them in the
    // billing queue. Completion is what puts a delivered trip in front of the money: `markCompleted`
    // runs the real gate (documents), advances to `billing_pending` and creates the billing item.
    // Nothing is invoiced by this — the next step (Billing Ready) needs pricing and stays human.
    //
    // A condição olha o ESTADO da viagem, não o que esta rodada moveu. O `ENCERRADOS` está aqui só
    // para não bater na porta de mil e novecentas viagens já fechadas a cada ciclo: quem decide de
    // verdade continua sendo `closeTripFromSource` (que anda só por transições declaradas e recusa
    // viagem terminal) e `markCompleted` (que roda a trava dos documentos).
    //
    // Called outside the transaction because it opens its own, and never fatally: a trip that cannot
    // complete (a document missing, someone moved it meanwhile) is reported, and the rest go on.
    if (tripId && fechar && !ENCERRADOS.has(statusFinal)) {
      try {
        // `close_only` é o backfill do histórico: conclui e para, sem entrar na fila do dinheiro.
        // Essas viagens rodaram antes de o TMS existir e já foram cobradas por fora.
        if (onCompleted === "close_only") {
          await closeTripFromSource(tripId, "FINALIZADA", actorUserId, sourceLabel);
        } else {
          /**
           * `markCompleted` só conclui a partir de `unloaded` — é o portão do dinheiro e está certo.
           *
           * Só que o portal nem sempre carimba a hora da descarga: a viagem para em "No destino" ou
           * "Descarregando" com o cliente dizendo Completed, e o portão recusava para sempre. Andar
           * até `unloaded` pelas transições declaradas resolve sem afrouxar nada — a trava dos
           * documentos continua sendo `markCompleted`, logo abaixo, e o item de faturamento continua
           * nascendo por lá.
           *
           * `advanceTripFromSource` é forward-only e recusa viagem sem recurso ativo. Uma viagem que
           * o portal diz concluída mas que não tem ninguém dirigindo continua sem fechar, e agora
           * aparece como `completion_blocked` em vez de sumir do relatório.
           */
          await advanceTripFromSource(
            tripId,
            "unloaded",
            "CONCLUIDA NO PORTAL",
            actorUserId,
            sourceLabel,
          );
          await markCompleted(tripId, {}, actorUserId);
        }
        out.push({ ...base, status: "completed" });
      } catch (error) {
        out.push({
          ...base,
          status: "completion_blocked",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return out;
}

/** The portal's own word for "this one ran to the end". Anything else is not a completion. */
function isCompletedAtPortal(status: string | null): boolean {
  return (status ?? "").trim().toLowerCase() === "completed";
}

/** Viagem que já acabou aqui — não se tenta fechar de novo a cada ciclo do robô. */
const ENCERRADOS = new Set<TripStatus>([
  "completed",
  "billing_pending",
  "billing_ready",
  "billed",
  "cancelled",
]);

/** Apply a whole export, trip by trip, and tally what happened. */
export async function applyPortalExecution(
  customerId: string,
  portalTrips: PortalTrip[],
  actorUserId: string,
  sourceLabel: string,
): Promise<PortalApplySummary> {
  const stationMap = await loadStationMap(customerId);
  // A aba "Aceito" e o "Concluído" também contam como ter sido vista: a viagem que saiu do Planejado
  // porque foi aceita não pode ser lida como retirada pelo cliente.
  await marcarVistasNoPortal(
    customerId,
    portalTrips.map((t) => t.externalTripId),
  );
  const outcomes: PortalApplyOutcome[] = [];

  for (const portal of portalTrips) {
    outcomes.push(
      ...(await applyPortalTrip(customerId, portal, stationMap, actorUserId, sourceLabel)),
    );
  }

  const count = (s: PortalApplyOutcome["status"]): number =>
    outcomes.filter((o) => o.status === s).length;

  return {
    applied: count("applied"),
    notFound: count("not_found"),
    alreadyAhead: count("already_ahead"),
    noMilestones: count("no_milestones"),
    unknownStation: count("unknown_station"),
    closed: count("closed"),
    completed: count("completed"),
    completionBlocked: count("completion_blocked"),
    outcomes,
  };
}

/**
 * Teach the TMS which of its locations is which station in the customer's system — the one-time
 * reconciliation the execution import depends on. Keyed on the CODE both sides already agree on
 * (`SOC-RJ2`), which the portal's own API exposes next to its station id.
 */
export async function linkStationIds(
  customerId: string,
  pairs: { stationId: string; code: string }[],
): Promise<{ linked: number; unknownCode: string[] }> {
  const unknownCode: string[] = [];
  let linked = 0;

  for (const { stationId, code } of pairs) {
    const updated = await db
      .update(locations)
      .set({ externalStationId: stationId, updatedAt: new Date() })
      .where(
        and(
          eq(locations.customerId, customerId),
          eq(locations.code, code),
          // Never steal an id already pointing at another site; re-running is safe.
          sql`(${locations.externalStationId} IS NULL OR ${locations.externalStationId} = ${stationId})`,
        ),
      )
      .returning({ id: locations.id });
    if (updated.length === 0) unknownCode.push(code);
    else linked += 1;
  }

  return { linked, unknownCode };
}

/** Trips the TMS holds for these external ids — used by the import preview to report coverage. */
export async function existingTripIds(
  customerId: string,
  externalTripIds: string[],
): Promise<Set<string>> {
  if (externalTripIds.length === 0) return new Set();
  const rows = await db
    .select({ externalTripId: trips.externalTripId })
    .from(trips)
    .where(and(eq(trips.customerId, customerId), inArray(trips.externalTripId, externalTripIds)));
  return new Set(rows.map((r) => r.externalTripId).filter((v): v is string => v != null));
}
