import { and, eq, isNull, sql } from "drizzle-orm";
import type { PortalTrip, TripStatus } from "@brazil-tms/shared";
import { db } from "../client";
import { drivers, trailers, tripAssignments, trips, vehicles } from "../../schema";
import { assignTrip, mirrorAssignmentFromPortal } from "./trip-assignments";
import { Conflict } from "../errors";

/** Viagem já em curso: o registro é retroativo, sem mexer no status (ver `mirrorAssignmentFromPortal`). */
const MIRROR_STATUSES = new Set<TripStatus>([
  "assigned",
  "confirmed",
  "at_origin",
  "loading",
  "loaded",
  "in_transit",
  "at_destination",
  "unloading",
  "unloaded",
]);

/**
 * Turning the customer's words into a real assignment (2026-08-16).
 *
 * The portal states a driver's NAME and the plates; the TMS keeps registered drivers and vehicles
 * with rules attached. The two are not redundant and one cannot replace the other: text proves
 * nothing, while a link makes the TMS able to catch an expired licence, a vehicle of the wrong type,
 * or the same driver on two trips at once — and it is what silences the "no assignment" alert.
 *
 * So the customer's text is matched to the registry, and ONLY an exact match is written. Measured on
 * the live data before building this: 38 of 41 plates and 38 of 41 driver names already match, so
 * the automation carries almost everything and the handful left over are visible on the trip's own
 * screen (the portal card sits right above the empty form).
 *
 * Two deliberate refusals:
 *   - It never overrides a warning silently. `assignTrip` blocks on an expired licence or a vehicle
 *     type mismatch, and that refusal is the POINT: the customer put someone on the road the TMS
 *     would have stopped, and a robot must not wave that through.
 *   - It never invents a resource. A driver the fleet does not have is reported, not created.
 *
 * Uma terceira recusa caiu (2026-08-16): "só atribui viagem em `received`". A viagem só aparece no
 * portal depois de aceita, então boa parte delas chega aqui já andando, e a regra deixava o motorista
 * visível no card e o painel de Atribuições vazio para sempre. Agora a viagem em curso é registrada
 * onde está, sem mexer no status — ver `mirrorAssignmentFromPortal`.
 */

export type FleetLinkOutcome =
  | "linked"
  /** Vinculado apesar de avisos — o motivo fica gravado na própria atribuição. */
  | "linked_with_warnings"
  | "already_assigned"
  | "not_assignable"
  /** O portal ainda não disse quem vai — não é problema, é uma viagem sem motorista designado. */
  | "not_stated"
  | "no_match"
  | "blocked";

export interface FleetLinkResult {
  outcome: FleetLinkOutcome;
  /** What was missing or what blocked it — shown in the import history, never swallowed. */
  detail?: string;
}

/** Plates compare as letters and digits only: "DPF-9J13" and "dpf9j13" are the same truck. */
const foldPlate = (value: string): string => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** The two plates the portal packs into one field: tractor first, trailer second. */
function platesOf(label: string | null): { vehicle: string | null; trailer: string | null } {
  if (!label) return { vehicle: null, trailer: null };
  const parts = label
    .split(/[,;/]/)
    .map((p) => foldPlate(p))
    .filter(Boolean);
  return { vehicle: parts[0] ?? null, trailer: parts[1] ?? null };
}

export async function linkFleetFromPortal(
  tripId: string,
  portal: PortalTrip,
  actorUserId: string,
): Promise<FleetLinkResult> {
  const { vehicle: vehiclePlate, trailer: trailerPlate } = platesOf(portal.plateLabel);
  const driverName = portal.driverLabel?.trim() ?? "";
  // A maioria das viagens ainda não tem motorista designado no portal. Isso não é uma falha de
  // casamento — contar como tal enterraria os casos que realmente precisam de cadastro.
  if (!vehiclePlate || !driverName) return { outcome: "not_stated" };

  const trip = (
    await db
      .select({ currentStatus: trips.currentStatus })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1)
  )[0];
  if (!trip) return { outcome: "not_assignable", detail: "viagem não encontrada" };

  /**
   * Em qual dos dois caminhos esta viagem entra (2026-08-16).
   *
   * `received` é o caso normal: atribui e move para "Atribuída". Qualquer status em curso é a viagem
   * que chegou aqui já andando — o portal só a mostra depois de aceita — e aí o registro é retroativo,
   * sem tocar no status. Encerrada não recebe nada.
   *
   * Isto era uma recusa seca em tudo que não fosse `received`, e o efeito era o motorista aparecer no
   * card do portal enquanto o painel de Atribuições ficava vazio para sempre.
   */
  const emCurso = trip.currentStatus !== "received";
  if (emCurso && !MIRROR_STATUSES.has(trip.currentStatus as TripStatus)) {
    return { outcome: "not_assignable", detail: trip.currentStatus };
  }

  const current = await db
    .select({ id: tripAssignments.id })
    .from(tripAssignments)
    .where(and(eq(tripAssignments.tripId, tripId), eq(tripAssignments.isCurrent, true)))
    .limit(1);
  if (current[0]) return { outcome: "already_assigned" };

  const vehicle = (
    await db
      .select({
        id: vehicles.id,
        ownershipType: vehicles.ownershipType,
        carrierId: vehicles.carrierId,
      })
      .from(vehicles)
      .where(
        and(
          sql`upper(regexp_replace(${vehicles.plate}, '[^A-Za-z0-9]', '', 'g')) = ${vehiclePlate}`,
          eq(vehicles.status, "active"),
          isNull(vehicles.archivedAt),
        ),
      )
      .limit(1)
  )[0];

  const driver = (
    await db
      .select({
        id: drivers.id,
        ownershipType: drivers.ownershipType,
        carrierId: drivers.carrierId,
      })
      .from(drivers)
      .where(
        and(
          sql`upper(btrim(${drivers.name})) = ${driverName.toUpperCase()}`,
          eq(drivers.status, "active"),
          isNull(drivers.archivedAt),
        ),
      )
      .limit(1)
  )[0];

  if (!vehicle || !driver) {
    const faltando = [
      !driver ? `motorista "${driverName}"` : null,
      !vehicle ? `placa ${vehiclePlate}` : null,
    ]
      .filter(Boolean)
      .join(" e ");
    return { outcome: "no_match", detail: `sem cadastro: ${faltando}` };
  }

  // The trailer is optional: a missing one is not a reason to leave the trip unassigned.
  const trailer = trailerPlate
    ? (
        await db
          .select({ id: trailers.id })
          .from(trailers)
          .where(
            and(
              sql`upper(regexp_replace(${trailers.plate}, '[^A-Za-z0-9]', '', 'g')) = ${trailerPlate}`,
              eq(trailers.status, "active"),
              isNull(trailers.archivedAt),
            ),
          )
          .limit(1)
      )[0]
    : undefined;

  /**
   * A transportadora, quando os recursos são subcontratados — que é a regra e não a exceção nesta
   * frota: 883 dos 982 motoristas e 888 dos 902 veículos. Ela NÃO é uma decisão nova: cada recurso
   * subcontratado já carrega a sua (o banco exige por constraint). Sem passá-la, `assignTrip` recusa
   * tudo por "atribuição incompleta" — foi exatamente o que aconteceu na primeira rodada, 48
   * bloqueios e zero vínculos.
   */
  const subcontratado =
    driver.ownershipType === "subcontracted" || vehicle.ownershipType === "subcontracted";
  const carrierId = driver.carrierId ?? vehicle.carrierId ?? undefined;

  /**
   * Motorista e veículo cadastrados sob transportadoras diferentes (decisão 2026-08-16).
   *
   * Isto começou recusando o vínculo, por um raciocínio que continua válido em tese: juntar gente de
   * uma transportadora com caminhão de outra é uma escolha comercial, não um detalhe a adivinhar.
   *
   * Só que a divergência medida aqui não carrega escolha nenhuma. A frota entrou por planilha e caiu
   * em dois baldes: 878 motoristas em "Agregados", 575 veículos em "Transportes Parceiros (Demo)".
   * Não há um par que discorde — há uma importação que arquivou os dois lados em lugares diferentes,
   * e a regra estava recusando 40 das 57 viagens vivas por causa disso.
   *
   * Então vale a transportadora do MOTORISTA: é com a pessoa que o contrato existe, o veículo segue
   * quem dirige, e nenhum dos dois lados é inventado. A divergência não é engolida — vai escrita na
   * atribuição, que é onde alguém olha quando o pagamento do subcontratado não bate.
   */
  const carrierDiverges = Boolean(
    subcontratado && driver.carrierId && vehicle.carrierId && driver.carrierId !== vehicle.carrierId,
  );

  const nota = [
    "Atribuição espelhada do portal do cliente.",
    emCurso ? `Registrada com a viagem já em curso (${trip.currentStatus}).` : null,
    carrierDiverges
      ? "Transportadora tomada do motorista; o veículo está cadastrado sob outra."
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const base = {
    driverId: driver.id,
    vehicleId: vehicle.id,
    trailerId: trailer?.id,
    carrierId: subcontratado ? carrierId : undefined,
    // The optimistic guard: if a dispatcher assigned this trip a second ago, our write loses
    // rather than overwriting a person's decision.
    expectedFromStatus: trip.currentStatus as TripStatus,
    notes: nota,
  };

  // Viagem parada em "Recebida" é atribuída de verdade e avança; viagem já andando é registrada onde
  // está. Os dois passam pelo MESMO avaliador — só o efeito no status difere.
  const atribuir = emCurso ? mirrorAssignmentFromPortal : assignTrip;

  try {
    // Strict first: if nothing is wrong, the assignment carries no excuse attached to it.
    await atribuir(tripId, base, actorUserId);
    return { outcome: "linked" };
  } catch (error) {
    if (!(error instanceof Conflict)) throw error;
    // A hard refusal stands — expired documents, inactive driver, vehicle in maintenance, expired
    // carrier contract. The customer put someone on the road the TMS would have stopped, and a robot
    // must not wave that through.
    if (error.code !== "OVERRIDE_REQUIRED") return { outcome: "blocked", detail: error.message };

    const avisos = warningCodes(error.details);
    // The one warning that is a real conflict RIGHT NOW rather than a gap in our own records: the
    // same driver or truck already committed to another trip at the same time. That is a decision,
    // not paperwork, so it stays with a person (decision 2026-08-16).
    if (avisos.includes("schedule_overlap")) {
      return { outcome: "blocked", detail: "conflito de agenda: recurso já está em outra viagem" };
    }

    // Everything else is our registry catching up with reality — 901 of 902 vehicles have no
    // document date on file, so demanding a human for each would mean nobody is ever assigned. The
    // mirror proceeds, and the reason says exactly what was accepted and why, on the record.
    try {
      await atribuir(
        tripId,
        {
          ...base,
          overrideReason: `Espelho da atribuição do cliente no portal. Avisos aceitos: ${
            avisos.join(", ") || "não detalhados"
          }.`,
        },
        actorUserId,
      );
      return { outcome: "linked_with_warnings", detail: avisos.join(", ") };
    } catch (retry) {
      if (retry instanceof Conflict) return { outcome: "blocked", detail: retry.message };
      throw retry;
    }
  }
}

/** The finding codes carried by an `OVERRIDE_REQUIRED`, when it carries any. */
function warningCodes(details: unknown): string[] {
  if (!Array.isArray(details)) return [];
  return details
    .map((f) => (f && typeof f === "object" ? String((f as { code?: unknown }).code ?? "") : ""))
    .filter(Boolean);
}
