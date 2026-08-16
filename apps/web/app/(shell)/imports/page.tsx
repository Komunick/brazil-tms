import { redirect } from "next/navigation";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { TripImportClient } from "@/components/imports/trip-import-client";
import { RegistryImportCard } from "@/components/imports/registry-import-card";
import { PortalExecutionCard } from "@/components/imports/portal-execution-card";

/**
 * Trip Import (004 US1). Server guard: no `import_trips` → home (FR-006).
 *
 * Three imports share this screen, in the order the day runs: the PLAN (trips to run), the REGISTRY
 * (who runs them), and the EXECUTION (what actually happened — the customer's portal export, whose
 * real arrival/departure times the TMS has no other source for).
 *
 * The registry import does NOT share the screen's permission: it writes the fleet registries, so it
 * is gated by `manage_fleet_data` and only rendered for holders. The execution import writes trip
 * milestones, so it rides on this screen's own `import_trips`. The BFF re-checks on every upload.
 */
export default async function ImportsPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user.role, "import_trips")) redirect("/");

  return (
    <div className="space-y-6">
      <TripImportClient />
      {can(session.user.role, "manage_fleet_data") ? <RegistryImportCard /> : null}
      <PortalExecutionCard />
    </div>
  );
}
