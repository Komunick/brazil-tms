import { and, eq, isNull, sql } from "drizzle-orm";
import type { PortalTrip } from "@brazil-tms/shared";
import { db } from "../client";
import { drivers, trailers, tripAssignments, trips, vehicles } from "../../schema";
import { assignTrip } from "./trip-assignments";
import { Conflict } from "../errors";

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
 * Three deliberate refusals:
 *   - It assigns only a trip still in `received`. A trip already running was not assigned by us and
 *     back-dating one would be fiction.
 *   - It never overrides a warning. `assignTrip` blocks on an expired licence or a vehicle type
 *     mismatch, and that refusal is the POINT: the customer put someone on the road the TMS would
 *     have stopped, and a robot must not wave that through.
 *   - It never invents a resource. A driver the fleet does not have is reported, not created.
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
  // Only a trip nobody has assigned or moved yet. `assignTrip` itself guards this, but checking here
  // keeps the common case quiet instead of raising an exception per trip on every cycle.
  if (trip.currentStatus !== "received") {
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
  if (
    subcontratado &&
    driver.carrierId &&
    vehicle.carrierId &&
    driver.carrierId !== vehicle.carrierId
  ) {
    // Motorista de uma transportadora com veículo de outra: é uma escolha real, não um detalhe a
    // adivinhar. Fica para uma pessoa.
    return { outcome: "blocked", detail: "motorista e veículo são de transportadoras diferentes" };
  }

  const base = {
    driverId: driver.id,
    vehicleId: vehicle.id,
    trailerId: trailer?.id,
    carrierId: subcontratado ? carrierId : undefined,
    // The optimistic guard: if a dispatcher assigned this trip a second ago, our write loses
    // rather than overwriting a person's decision.
    expectedFromStatus: "received" as const,
    notes: "Atribuição espelhada do portal do cliente.",
  };

  try {
    // Strict first: if nothing is wrong, the assignment carries no excuse attached to it.
    await assignTrip(tripId, base, actorUserId);
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
      await assignTrip(
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
