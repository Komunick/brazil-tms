import { and, eq } from "drizzle-orm";
import {
  normalizeVehicleType,
  parsePortalInstant,
  vehicleTypeSchema,
  type PortalLeg,
  type PortalTrip,
  type TripStatus,
  type VehicleType,
} from "@brazil-tms/shared";
import { db } from "../client";
import { trips } from "../../schema";
import { createTrip } from "./trips-service";
import { garantirEstacao } from "./portal-station-autocreate";
import { updateTripPlan } from "./trip-plan";
// `isCancelledAtPortal` vem de lá para os DOIS caminhos julgarem o cancelamento pela mesma regra —
// foi a falta disso que deixou o Concluído sem saber cancelar (2026-08-17).
import {
  applyPortalTrip,
  isCancelledAtPortal,
  loadStationMap,
  type PortalApplyOptions,
  type PortalApplyOutcome,
} from "./portal-execution-apply";
import { closeTripFromSource } from "./source-status";
import { marcarVistasNoPortal } from "./portal-withdrawn";
import { linkFleetFromPortal, type FleetLinkResult } from "./portal-fleet-link";
import { writePortalFacts } from "./portal-trip-facts";

/**
 * The PLAN, taken from the customer's portal instead of a hand-typed spreadsheet (2026-08-16).
 *
 * Same export shape as the execution import — one row per stop — read for a different purpose: the
 * S columns (`STA`/`STD`) are what the customer INTENDS, so they become the trip's planned windows.
 * This is the half that lets the planning spreadsheet be switched off: every field it fed (id,
 * stations, windows, vehicle) comes from here, machine-written, with no `#N/D` and no two movements
 * stacked inside one cell.
 *
 * It is deliberately a SEPARATE act from the execution import, chosen by the operator, because the
 * two exports mean different things and only one of them may create a trip:
 *
 *   Planejado  → this: creates the trips (and updates the plan of the ones already here).
 *   Concluído  → the execution import: never creates, only records what happened.
 *
 * Running the plan import over a Concluído export would manufacture thousands of finished trips
 * nobody can act on — the exact flood the spreadsheet import already learned to avoid.
 */

export interface PortalPlanOutcome extends Omit<PortalApplyOutcome, "status"> {
  status: "created" | "updated" | "unchanged" | "cancelled" | "unknown_station" | "failed";
  detail?: string;
}

export interface PortalPlanSummary {
  created: number;
  updated: number;
  unchanged: number;
  cancelled: number;
  unknownStation: number;
  failed: number;
  /**
   * POR QUE falharam (2026-08-17).
   *
   * O contador existia sozinho, e o backfill do histórico devolveu **71 falhas sem uma linha de
   * explicação** — o mesmo tipo de silêncio que me custou horas hoje em outros lugares. Um número de
   * erro que não diz o que houve não é diagnóstico, é só um número.
   *
   * Guarda os motivos DISTINTOS, com teto: 71 falhas costumam ser duas ou três causas repetidas, e a
   * lista serve para nomeá-las, não para transcrever cada uma.
   */
  failedReasons: string[];
  /** Milestones applied on top, when the same file already carries real times. */
  milestones: number;
  /** Trips whose driver/vehicle the portal named and the TMS matched to its own registered fleet. */
  linked: number;
  /** Destas, quantas passaram com avisos aceitos (o motivo fica gravado na atribuição). */
  linkedWithWarnings: number;
  /** The portal named someone the fleet does not have registered — reported, never invented. */
  linkNoMatch: number;
  /** O portal ainda não designou ninguém para a viagem — não é pendência de cadastro. */
  linkNotStated: number;
  /**
   * The TMS's own rules refused the customer's choice (vehicle documents, wrong vehicle type,
   * subcontracting without a carrier). NOT an expired driver licence since 2026-08-19: that one
   * links and warns, because refusing hid who was driving without stopping the trip.
   */
  linkBlocked: number;
  linkBlockedReasons: string[];
  outcomes: PortalPlanOutcome[];
}

/**
 * The customer's word for the vehicle → the enum, or null. A label nobody recognizes leaves the
 * trip without a planned type rather than blocking the whole leg: the movement is real either way,
 * and an unmappable type is a data question, not a reason to lose the trip.
 */
function vehicleTypeFrom(label: string | null): VehicleType | null {
  if (!label) return null;
  const parsed = vehicleTypeSchema.safeParse(normalizeVehicleType(label));
  return parsed.success ? parsed.data : null;
}

/**
 * The plan a leg states: both ends, the two windows, and the vehicle the customer asked for.
 *
 * The delivery window's END falls back to its START (2026-08-16). The portal states a planned
 * DEPARTURE for every stop a truck leaves again, and nothing for the one where the trip ends — so
 * the last leg had a delivery window with no end, on 860 of 871 trips in tmsdev. That is not a
 * cosmetic gap: `delayed_destination_arrival` (the late-delivery alert) requires
 * `plannedDeliveryWindowEnd`, so late delivery fired for NOBODY on portal trips. When the customer
 * promises an arrival time and no departure, the promise IS a point in time, and the deadline is
 * that point — the SLA rule's `deliveryToleranceMinutes` is what grants the grace, not a window the
 * customer never stated.
 */
function planFrom(leg: PortalLeg, vehicleLabel: string | null) {
  const plannedDeliveryWindowStart = parsePortalInstant(leg.destination.plannedArrival);
  return {
    plannedPickupWindowStart: parsePortalInstant(leg.origin.plannedArrival),
    plannedPickupWindowEnd: parsePortalInstant(leg.origin.plannedDeparture),
    plannedDeliveryWindowStart,
    plannedDeliveryWindowEnd:
      parsePortalInstant(leg.destination.plannedDeparture) ?? plannedDeliveryWindowStart,
    plannedVehicleType: vehicleTypeFrom(vehicleLabel),
  };
}

/** True when the stored plan already says exactly this — then the import writes nothing. */
function samePlan(
  current: {
    plannedPickupWindowStart: Date | null;
    plannedPickupWindowEnd: Date | null;
    plannedDeliveryWindowStart: Date | null;
    plannedDeliveryWindowEnd: Date | null;
    plannedVehicleType: string | null;
  },
  next: ReturnType<typeof planFrom>,
): boolean {
  const time = (d: Date | null): number | null => (d ? d.getTime() : null);
  return (
    time(current.plannedPickupWindowStart) === time(next.plannedPickupWindowStart) &&
    time(current.plannedPickupWindowEnd) === time(next.plannedPickupWindowEnd) &&
    time(current.plannedDeliveryWindowStart) === time(next.plannedDeliveryWindowStart) &&
    time(current.plannedDeliveryWindowEnd) === time(next.plannedDeliveryWindowEnd) &&
    (current.plannedVehicleType ?? null) === (next.plannedVehicleType ?? null)
  );
}

/**
 * Create or update the trips one portal trip states, then let the execution half record anything
 * the same file already proves. A trip the portal reports Cancelled is created and cancelled, so the
 * operation can still answer "why didn't this one run?" — the same call the spreadsheet import makes.
 */
export interface PortalPlanOptions extends PortalApplyOptions {
  /**
   * Casar a frota registrada com o que o cliente escreveu. Ligado no dia a dia; DESLIGADO no backfill
   * do histórico (2026-08-17) — uma viagem que terminou há três semanas não precisa de atribuição, e
   * criar vínculo em massa em viagem encerrada encheria o histórico de cada motorista de trabalho que
   * ninguém fez aqui.
   */
  linkFleet?: boolean;
  /**
   * Reescrever o plano de uma viagem que JÁ existe. Ligado no dia a dia — o cliente remaneja horário
   * e o TMS acompanha. Desligado no backfill: ele veio buscar o que faltava, não corrigir o que já
   * estava aqui.
   */
  updatePlan?: boolean;
}

export async function applyPortalPlanTrip(
  customerId: string,
  portal: PortalTrip,
  stationMap: Map<string, string>,
  actorUserId: string,
  sourceLabel: string,
  options: PortalPlanOptions = {},
): Promise<{ outcomes: PortalPlanOutcome[]; milestones: number; links: FleetLinkResult[] }> {
  const outcomes: PortalPlanOutcome[] = [];
  // O que o vínculo automático com a frota conseguiu (ou não) fazer, por perna.
  const links: FleetLinkResult[] = [];
  const linkFleet = options.linkFleet ?? true;
  const updatePlan = options.updatePlan ?? true;

  for (const leg of portal.legs) {
    const base = { externalTripId: portal.externalTripId, legNumber: leg.legNumber };
    /**
     * ESTAÇÃO QUE O TMS NÃO CONHECE NASCE AQUI, do catálogo do próprio cliente (2026-08-21).
     *
     * Antes, a viagem inteira era descartada — nem viagem, nem linha de importação, só um aviso no
     * console da VM. Ver `portal-station-autocreate.ts` para por que copiar o que o cliente afirma
     * não é adivinhar, e por que isso não transforma proposta em rota nossa.
     *
     * O mapa é atualizado na hora: a mesma estação costuma aparecer em dezenas de viagens do mesmo
     * lote, e sem isso cada uma tentaria criá-la de novo.
     */
    const resolver = async (parada: (typeof leg)["origin"]): Promise<string | undefined> => {
      if (!parada.stationId) return undefined;
      const conhecido = stationMap.get(parada.stationId);
      if (conhecido) return conhecido;
      const criada = await garantirEstacao(customerId, parada, actorUserId);
      if (!criada) return undefined;
      stationMap.set(parada.stationId, criada.locationId);
      return criada.locationId;
    };
    const originLocationId = await resolver(leg.origin);
    const destinationLocationId = await resolver(leg.destination);

    if (!originLocationId || !destinationLocationId) {
      outcomes.push({
        ...base,
        status: "unknown_station",
        detail: !originLocationId ? leg.origin.stationValue : leg.destination.stationValue,
      });
      continue;
    }

    const plan = planFrom(leg, portal.vehicleLabel);

    try {
      const existing = (
        await db
          .select()
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
        const created = await createTrip(
          {
            customerId,
            externalTripId: portal.externalTripId,
            legNumber: leg.legNumber,
            originLocationId,
            destinationLocationId,
            ...plan,
          },
          actorUserId,
        );
        await writePortalFacts(created.id, portal);
        if (isCancelledAtPortal(portal.status)) {
          await closeTripFromSource(created.id, "CANCELADA", actorUserId, sourceLabel);
          outcomes.push({ ...base, status: "cancelled" });
        } else {
          if (linkFleet) links.push(await linkFleetFromPortal(created.id, portal, actorUserId));
          outcomes.push({ ...base, status: "created" });
        }
        continue;
      }

      // Who the CUSTOMER put on this trip. Written on every pass, not only on create: the portal
      // assigns a driver hours after planning the trip, so a create-only write would miss almost
      // every one of them.
      const fieldsChanged = await writePortalFacts(
        existing.id,
        portal,
        existing.customerFields,
        existing.customerPriceCents,
      );

      // And the same words, matched to the registered fleet. Attempted on every pass because the
      // driver usually appears LATER than the trip: a create-only attempt would find nobody.
      if (linkFleet) links.push(await linkFleetFromPortal(existing.id, portal, actorUserId));

      // An existing trip keeps its status: the plan is updated, the lifecycle is not touched here.
      //
      // O backfill NÃO reescreve plano de viagem que já existe (2026-08-17). Ele veio buscar o que
      // faltava, não corrigir o que já estava aqui — e uma viagem que já rodou está fora da fase
      // editável, então `updateTripPlan` a recusa por revisão obrigatória. Foram as 71 "falhas" da
      // primeira varredura: nada quebrado, só o backfill tentando um trabalho que não é dele.
      if (!updatePlan || samePlan(existing, plan)) {
        outcomes.push({ ...base, status: fieldsChanged ? "updated" : "unchanged" });
        continue;
      }
      await updateTripPlan(existing.id, plan, { authorizedReview: false }, actorUserId);
      outcomes.push({ ...base, status: "updated" });
    } catch (error) {
      // One bad leg never costs the rest of the file — it is reported with its reason.
      outcomes.push({
        ...base,
        status: "failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Whatever the same file already proves about execution, recorded on top of the plan just written.
  const applied = await applyPortalTrip(customerId, portal, stationMap, actorUserId, sourceLabel, {
    onCompleted: options.onCompleted,
  });
  const milestones = applied.filter((o) => o.status === "applied").length;

  return { outcomes, milestones, links };
}

export async function applyPortalPlan(
  customerId: string,
  portalTrips: PortalTrip[],
  actorUserId: string,
  sourceLabel: string,
  options: PortalPlanOptions = {},
): Promise<PortalPlanSummary> {
  const stationMap = await loadStationMap(customerId);
  const outcomes: PortalPlanOutcome[] = [];
  const links: FleetLinkResult[] = [];
  let milestones = 0;

  for (const portal of portalTrips) {
    const result = await applyPortalPlanTrip(
      customerId,
      portal,
      stationMap,
      actorUserId,
      sourceLabel,
      options,
    );
    outcomes.push(...result.outcomes);
    links.push(...result.links);
    milestones += result.milestones;
  }

  /**
   * O carimbo vem DEPOIS do laço, e a ordem é o conserto de um defeito real (2026-08-18).
   *
   * Estava antes, e parecia igual: a lista lida é a mesma nos dois pontos. Só que `marcarVistasNoPortal`
   * é um UPDATE — ele só alcança viagem que JÁ EXISTE. Antes do laço, a viagem que está aparecendo
   * pela PRIMEIRA vez ainda não foi criada, e não recebe carimbo nenhum.
   *
   * Numa leitura seguinte ela existiria e seria carimbada, então na maioria das vezes isso se
   * corrigia sozinho e não dava sinal. O caso que não se corrige é justamente o que interessa: a
   * viagem que aparece UMA vez e o cliente retira em seguida nasce com carimbo nulo e morre com ele.
   * E carimbo nulo é a primeira trava da varredura — "nunca esteve no portal" —, então ela fica
   * imortal, alertando para sempre, exatamente o que a varredura existia para acabar.
   *
   * Aconteceu com duas viagens no dia em que a varredura entrou (LT1Q8I02EDRN2, LT1Q8I02EDSH1), e
   * elas apareceram no quadro de alertas ativos justamente porque eram intocáveis.
   */
  await marcarVistasNoPortal(
    customerId,
    portalTrips.map((t) => t.externalTripId),
  );

  const count = (s: PortalPlanOutcome["status"]): number =>
    outcomes.filter((o) => o.status === s).length;
  const links_ = (o: FleetLinkResult["outcome"]): number =>
    links.filter((l) => l.outcome === o).length;

  return {
    created: count("created"),
    updated: count("updated"),
    unchanged: count("unchanged"),
    cancelled: count("cancelled"),
    unknownStation: count("unknown_station"),
    failed: count("failed"),
    // Os motivos distintos, com teto — 71 falhas costumam ser duas ou três causas repetidas.
    failedReasons: [
      ...new Set(outcomes.filter((o) => o.status === "failed" && o.detail).map((o) => o.detail!)),
    ].slice(0, 20),
    milestones,
    // O vínculo com a frota registrada. `blocked` é o que precisa de gente: o cliente pôs alguém
    // que as regras do TMS recusam (documento vencido, tipo de veículo, subcontratação sem
    // transportadora), e as razões vão junto para aparecerem no histórico.
    linked: links_("linked") + links_("linked_with_warnings"),
    linkedWithWarnings: links_("linked_with_warnings"),
    linkNoMatch: links_("no_match"),
    linkNotStated: links_("not_stated"),
    linkBlocked: links_("blocked"),
    linkBlockedReasons: [
      ...new Set(links.filter((l) => l.outcome === "blocked" && l.detail).map((l) => l.detail!)),
    ].slice(0, 20),
    outcomes,
  };
}

export type { TripStatus };
