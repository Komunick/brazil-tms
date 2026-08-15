import { redirect } from "next/navigation";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { TripImportClient } from "@/components/imports/trip-import-client";
import { RegistryImportCard } from "@/components/imports/registry-import-card";

/**
 * Trip Import (004 US1). Server guard: no `import_trips` → home (FR-006).
 *
 * The registry import (drivers/vehicles/trailers from the customer workbook) shares this screen but
 * NOT its permission: it writes the fleet registries, so it is gated by `manage_fleet_data` and only
 * rendered for holders — the BFF re-checks on every upload.
 */
export default async function ImportsPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user.role, "import_trips")) redirect("/");

  return (
    <div className="space-y-6">
      <TripImportClient />
      {can(session.user.role, "manage_fleet_data") ? <RegistryImportCard /> : null}
    </div>
  );
}
