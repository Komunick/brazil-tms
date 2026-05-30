import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { cancellationOptions, customers, db, locations, trips } from "../src";

/**
 * Feature 003 trip-domain seed. Seeds the `cancellation_options` `billing_impact` value set as
 * LABELED SCAFFOLDING (Constitution II — §19.5 examples) and intentionally leaves the `reason` codes
 * EMPTY: those are business-blocked, so a production cancellation fails with
 * `CANCELLATION_NOT_CONFIGURED` until business supplies the codes (tests/e2e seed their own).
 *
 * Optionally anchors 1 sample trip on the `db:seed:master-data` demo customer (DEMO-SHOPEE) so the
 * read-only inspector has something to show. Idempotent: re-running is a no-op once seeded. Run AFTER
 * `db:migrate`:  pnpm --filter @brazil-tms/db db:seed:trip-domain
 */

// §19.5 examples — billing-impact scaffolding (labeled; NOT final business sign-off).
const BILLING_IMPACTS = [
  { code: "no_charge", labelPt: "Sem cobrança", sortOrder: 1 },
  { code: "cancellation_fee", labelPt: "Taxa de cancelamento", sortOrder: 2 },
  { code: "manual_review", labelPt: "Revisão manual", sortOrder: 3 },
] as const;

const SAMPLE_EXTERNAL_TRIP_ID = "DEMO-TRIP-001";

async function seedCancellationOptions(): Promise<void> {
  for (const b of BILLING_IMPACTS) {
    const existing = await db
      .select({ id: cancellationOptions.id })
      .from(cancellationOptions)
      .where(
        and(eq(cancellationOptions.kind, "billing_impact"), eq(cancellationOptions.code, b.code)),
      )
      .limit(1);
    if (existing[0]) continue;
    await db.insert(cancellationOptions).values({
      kind: "billing_impact",
      code: b.code,
      labelPt: b.labelPt,
      sortOrder: b.sortOrder,
    });
  }
  // `reason` codes are intentionally NOT seeded (business-blocked). Do not add them here.
  console.log(
    "Seeded cancellation_options billing_impact scaffolding (no_charge, cancellation_fee, manual_review); reason codes left EMPTY (business-blocked).",
  );
}

async function seedSampleTrip(): Promise<void> {
  const demo = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerCode, "DEMO-SHOPEE"))
    .limit(1);
  if (!demo[0]) {
    console.log("DEMO-SHOPEE master data absent; skipping sample trip (run db:seed:master-data first).");
    return;
  }
  const customerId = demo[0].id;

  const locs = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.customerId, customerId))
    .limit(2);
  if (locs.length < 2) {
    console.log("Need >=2 demo locations to anchor a trip; skipping sample trip.");
    return;
  }

  const existing = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.customerId, customerId), eq(trips.externalTripId, SAMPLE_EXTERNAL_TRIP_ID)))
    .limit(1);
  if (existing[0]) {
    console.log(`Sample trip ${SAMPLE_EXTERNAL_TRIP_ID} already present. Skipping.`);
    return;
  }

  const [origin, dest] = locs;
  const originalPlan = {
    customerId,
    originLocationId: origin!.id,
    destinationLocationId: dest!.id,
    plannedVehicleType: "truck",
  };
  await db.insert(trips).values({
    customerId,
    externalTripId: SAMPLE_EXTERNAL_TRIP_ID,
    originLocationId: origin!.id,
    destinationLocationId: dest!.id,
    currentStatus: "received",
    originalPlan,
    plannedVehicleType: "truck",
  });
  console.log(`Seeded sample trip ${SAMPLE_EXTERNAL_TRIP_ID} (status received) on DEMO-SHOPEE master data.`);
}

async function main(): Promise<void> {
  await seedCancellationOptions();
  await seedSampleTrip();
  console.log("Trip-domain seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
