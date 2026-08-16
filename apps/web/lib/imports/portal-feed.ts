import "server-only";
import { eq, isNull, and } from "drizzle-orm";
import { mapPortalApiTrips, type PortalApiEnvelope } from "@brazil-tms/shared";
import { customers, db, importBatches, users } from "@brazil-tms/db";
import { Conflict, NotFound } from "@/lib/api/respond";
import {
  applyParsedPortalTrips,
  closePortalBatch,
  type PortalImportMode,
  type PortalImportResult,
} from "@/lib/imports/portal-execution-import";

/**
 * The robot's door into the TMS (2026-08-16).
 *
 * A script on a logged-in machine reads the customer's portal every few minutes and POSTs one page
 * of its API response here, verbatim. Everything it sends is data, never instructions: the payload
 * is mapped by `mapPortalApiTrips` and then walks the SAME path an uploaded export walks
 * (`applyParsedPortalTrips`). The script cannot choose what happens to a trip; it can only say
 * "this is what the portal answered".
 *
 * The script stays deliberately thin — fetch and forward — because it lives on a VM where updating
 * it is a manual chore and testing it is impossible. Every judgement lives here, under test.
 */

export interface PortalFeedResult extends PortalImportResult {
  /** The batch this run recorded, or null when it changed nothing (see `worthRecording`). */
  batchId: string | null;
}

/**
 * Did this run do anything worth a line in the import history?
 *
 * A robot polling every few minutes would otherwise write ~300 history rows a day, all of them
 * saying "nothing changed", and bury the handful that matter. So a quiet run is silent: it is
 * recorded only when it moved a trip, or when it hit something a person must act on — an unresolved
 * station, a failure, a rejected trip.
 */
function worthRecording(result: PortalImportResult): boolean {
  const plan = result.planSummary;
  const exec = result.summary;
  return (
    (plan?.created ?? 0) > 0 ||
    (plan?.updated ?? 0) > 0 ||
    (plan?.cancelled ?? 0) > 0 ||
    (plan?.failed ?? 0) > 0 ||
    (plan?.milestones ?? 0) > 0 ||
    (exec?.applied ?? 0) > 0 ||
    (exec?.closed ?? 0) > 0 ||
    result.unknownStations.length > 0 ||
    result.rejected.length > 0
  );
}

async function activeCustomerId(customerCode: string): Promise<string> {
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.customerCode, customerCode), isNull(customers.archivedAt)))
    .limit(1);
  const id = rows[0]?.id;
  if (!id) throw new Conflict("UNKNOWN_CUSTOMER", `Cliente ${customerCode} não encontrado.`);
  return id;
}

/**
 * WHO the robot acts as. A service account, configured by e-mail (`PORTAL_FEED_ACTOR_EMAIL`) rather
 * than hardcoded, so every trip event and audit row the feed writes names a real, revocable user —
 * and so nobody has to wonder later which human "did" 500 status changes at 3am.
 */
async function feedActorId(): Promise<string> {
  const email = process.env.PORTAL_FEED_ACTOR_EMAIL;
  if (!email) {
    throw new Conflict(
      "FEED_ACTOR_UNSET",
      "PORTAL_FEED_ACTOR_EMAIL não configurado: o robô precisa de um usuário de serviço.",
    );
  }
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  const id = rows[0]?.id;
  if (!id) throw new NotFound("FEED_ACTOR_NOT_FOUND", `Usuário de serviço ${email} não existe.`);
  return id;
}

export async function ingestPortalFeed(input: {
  payload: PortalApiEnvelope;
  mode: PortalImportMode;
  customerCode: string;
}): Promise<PortalFeedResult> {
  // The portal answers `retcode: 0` on success. Anything else means the script forwarded an error
  // page (an expired session, a station it has no permission for) — applying that as "no trips"
  // would silently look like a quiet day.
  if (input.payload?.retcode != null && input.payload.retcode !== 0) {
    throw new Conflict(
      "PORTAL_ERROR",
      `O portal respondeu erro ${input.payload.retcode}: ${String(input.payload.message ?? "").slice(0, 120)}`,
    );
  }

  const parsed = mapPortalApiTrips(input.payload);
  const customerId = await activeCustomerId(input.customerCode);
  const actorUserId = await feedActorId();

  const result = await applyParsedPortalTrips({
    customerId,
    actorUserId,
    mode: input.mode,
    // What a trip's history will say moved it. "portal" — not a file name, because there is no file.
    sourceLabel: "portal",
    rows: Array.isArray(input.payload?.data?.list) ? input.payload.data!.list!.length : 0,
    parsed,
  });

  if (!worthRecording(result)) return { ...result, batchId: null };

  const batchId = crypto.randomUUID();
  await db.insert(importBatches).values({
    id: batchId,
    customerId,
    fileName: input.mode === "plan" ? "portal (plano)" : "portal (execução)",
    // There is no uploaded file to keep: the payload is re-readable from the portal at any time, and
    // storing every poll would fill the bucket with copies of the same 500 trips.
    storageKey: "",
    uploadedBy: actorUserId,
    source: input.mode === "plan" ? "portal_robot_plan" : "portal_robot_execution",
    status: "confirming",
    totalRows: result.rows,
  });
  await closePortalBatch(batchId, input.mode, result);

  return { ...result, batchId };
}
