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
  | "already_assigned"
  | "not_assignable"
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
  if (!vehiclePlate || !driverName) return { outcome: "no_match", detail: "portal não informou" };

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
      .select({ id: vehicles.id })
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
      .select({ id: drivers.id })
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

  try {
    await assignTrip(
      tripId,
      {
        driverId: driver.id,
        vehicleId: vehicle.id,
        trailerId: trailer?.id,
        // The optimistic guard: if a dispatcher assigned this trip a second ago, our write loses
        // rather than overwriting a person's decision.
        expectedFromStatus: "received",
        notes: "Atribuição espelhada do portal do cliente.",
      },
      actorUserId,
    );
    return { outcome: "linked" };
  } catch (error) {
    // A refusal here is information, not a failure to hide: the customer's own choice does not pass
    // the TMS's rules (licence, documents, vehicle type, subcontracting), and somebody should know.
    if (error instanceof Conflict) return { outcome: "blocked", detail: error.message };
    throw error;
  }
}
