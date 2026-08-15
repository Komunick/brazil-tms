import { and, eq, isNull } from "drizzle-orm";
import { assignTrip, db, drivers, trailers, trips, vehicles } from "@brazil-tms/db";

/**
 * Resource linking for the trip import (issue: "vai ter as LH, origem, destino, tudo vinculado ao
 * CPF, motorista e dados da carreta, cavalo").
 *
 * The customer's schedule already names who runs each trip, so confirming an import can do what a
 * dispatcher would do by hand — with the SAME rules. Every link goes through `assignTrip`, the very
 * function the Dispatch screen calls, which means:
 *
 *  - a BLOCK (expired licence, a driver already booked for that window, an inactive resource) leaves
 *    the trip unassigned in the queue and is reported. Those are conflicts inside the customer's own
 *    file; surfacing them is the point, and overriding them would put an illegal assignment on the road;
 *  - a WARN (a vehicle type that differs from the plan, missing paperwork) proceeds carrying a reason
 *    that names the source file, so the audit trail says why it was accepted;
 *  - a trip that is not `received` any more is left alone: the import never overrides a human.
 *
 * Matching mirrors what the spreadsheet itself does with PROCV: the driver by CPF when the file
 * carries one, otherwise by the name the schedule prints, against the registry loaded from the
 * MOTORISTAS tab; vehicle and trailer by plate. Nothing is created here — a resource the registry
 * does not know is reported, so the registry import (or the form) can fix it.
 *
 * The registry is read ONCE per batch into memory: a per-row lookup would mean four queries times
 * thousands of rows.
 */

/** What one import row asks for, read from the `resource.*` template targets. */
export interface ResourceRequest {
  driverName: string | null;
  driverCpf: string | null;
  vehiclePlate: string | null;
  trailerPlate: string | null;
}

export type LinkOutcome =
  | { status: "assigned" }
  | { status: "skipped"; reason: "no_resources" | "not_received" }
  | { status: "unresolved"; missing: string[] }
  | { status: "blocked"; code: string; detail: string };

export interface ResourceIndex {
  driversByCpf: Map<string, { id: string; name: string; carrierId: string | null }[]>;
  driversByName: Map<string, { id: string; carrierId: string | null }>;
  vehiclesByPlate: Map<string, { id: string; carrierId: string | null }>;
  trailersByPlate: Map<string, { id: string }>;
}

const fold = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
const digitsOf = (s: string): string => s.replace(/\D/g, "");
const plateOf = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Load the active registry once. Cheap (a few thousand rows) and removes all per-row queries. */
export async function buildResourceIndex(): Promise<ResourceIndex> {
  const [driverRows, vehicleRows, trailerRows] = await Promise.all([
    db
      .select({
        id: drivers.id,
        name: drivers.name,
        cpf: drivers.cpf,
        carrierId: drivers.carrierId,
      })
      .from(drivers)
      .where(isNull(drivers.archivedAt)),
    db
      .select({ id: vehicles.id, plate: vehicles.plate, carrierId: vehicles.carrierId })
      .from(vehicles)
      .where(isNull(vehicles.archivedAt)),
    db
      .select({ id: trailers.id, plate: trailers.plate })
      .from(trailers)
      .where(isNull(trailers.archivedAt)),
  ]);

  const driversByCpf = new Map<string, { id: string; name: string; carrierId: string | null }[]>();
  const driversByName = new Map<string, { id: string; carrierId: string | null }>();
  for (const d of driverRows) {
    if (d.cpf) {
      driversByCpf.set(d.cpf, [...(driversByCpf.get(d.cpf) ?? []), d]);
    }
    // First writer wins: a repeated name keeps the oldest registration.
    if (!driversByName.has(fold(d.name))) driversByName.set(fold(d.name), d);
  }

  return {
    driversByCpf,
    driversByName,
    vehiclesByPlate: new Map(vehicleRows.map((v) => [plateOf(v.plate), v])),
    trailersByPlate: new Map(trailerRows.map((t) => [plateOf(t.plate), t])),
  };
}

/** Read the `resource.*` keys the engine stored on the mapped row. */
export function resourceRequestFrom(mapped: Record<string, unknown>): ResourceRequest {
  const text = (key: string): string | null => {
    const value = mapped[key];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  };
  return {
    driverName: text("resource.driverName"),
    driverCpf: text("resource.driverCpf"),
    vehiclePlate: text("resource.vehiclePlate"),
    trailerPlate: text("resource.trailerPlate"),
  };
}

export function hasResourceRequest(request: ResourceRequest): boolean {
  return Boolean(request.driverName || request.driverCpf || request.vehiclePlate);
}

interface Resolution {
  driver?: { id: string; carrierId: string | null };
  vehicle?: { id: string; carrierId: string | null };
  trailerId?: string;
  missing: string[];
}

/** Pure lookup against the index — no I/O, so the preview can call it for every row cheaply. */
export function resolveResources(index: ResourceIndex, request: ResourceRequest): Resolution {
  const missing: string[] = [];

  let driver: { id: string; carrierId: string | null } | undefined;
  const cpf = request.driverCpf ? digitsOf(request.driverCpf) : "";
  if (cpf) {
    const candidates = index.driversByCpf.get(cpf) ?? [];
    // A CPF shared by two people (it happens in the real file) is only usable when the name agrees.
    driver =
      candidates.length === 1
        ? candidates[0]
        : candidates.find((d) => request.driverName && fold(d.name) === fold(request.driverName));
  }
  if (!driver && request.driverName) driver = index.driversByName.get(fold(request.driverName));
  if (!driver) missing.push(`motorista ${request.driverName ?? request.driverCpf ?? "?"}`);

  let vehicle: { id: string; carrierId: string | null } | undefined;
  if (request.vehiclePlate) {
    vehicle = index.vehiclesByPlate.get(plateOf(request.vehiclePlate));
    if (!vehicle) missing.push(`veículo ${request.vehiclePlate}`);
  } else {
    missing.push("veículo não informado");
  }

  // A trailer the registry does not know is NOT a blocker: the trip still runs with driver+vehicle.
  const trailerId = request.trailerPlate
    ? index.trailersByPlate.get(plateOf(request.trailerPlate))?.id
    : undefined;

  return { driver, vehicle, trailerId, missing };
}

/** Resolve + assign. Returns what happened so the caller records it on the row and counts it. */
export async function linkResources(
  tripId: string,
  request: ResourceRequest,
  index: ResourceIndex,
  actorUserId: string,
  sourceLabel: string,
): Promise<LinkOutcome> {
  if (!hasResourceRequest(request)) return { status: "skipped", reason: "no_resources" };

  const tripRows = await db
    .select({ status: trips.currentStatus })
    .from(trips)
    .where(and(eq(trips.id, tripId)))
    .limit(1);
  if (tripRows[0]?.status !== "received") return { status: "skipped", reason: "not_received" };

  const { driver, vehicle, trailerId, missing } = resolveResources(index, request);
  if (!driver || !vehicle) return { status: "unresolved", missing };

  try {
    await assignTrip(
      tripId,
      {
        expectedFromStatus: "received",
        driverId: driver.id,
        vehicleId: vehicle.id,
        trailerId,
        carrierId: driver.carrierId ?? vehicle.carrierId ?? undefined,
        // Documented override: the CUSTOMER already committed these resources in its schedule, and
        // the reason names the file so the audit trail explains the acceptance.
        overrideReason: `Atribuição vinda da importação (${sourceLabel}).`,
      },
      actorUserId,
    );
    return { status: "assigned" };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "ASSIGN_FAILED";
    const findings = (error as { details?: { code?: string; message?: string }[] }).details ?? [];
    const detail =
      findings
        .map((f) => f.message ?? f.code)
        .filter(Boolean)
        .join("; ") || (error as Error).message;
    return { status: "blocked", code, detail };
  }
}
