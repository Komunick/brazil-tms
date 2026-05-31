import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { ControlTowerTable } from "@/components/trips/control-tower-table";
import { getTripFilterOptions } from "@/lib/trips/trips-read";

/**
 * Control Tower board (feature 005, US1). Server guard enforces `view_all_trips` for the first time
 * (granted to all 7 internal roles in 001 but never enforced); the BFF stays authoritative. The
 * client `ControlTowerTable` owns URL filter state + TanStack Query polling (30s, no Realtime).
 *
 * The filter dropdown options (customers / locations / lanes) are loaded HERE, server-side, under the
 * same `view_all_trips` guard, and passed to the client board — so the read-only roles 005 newly
 * serves don't hit the `manage_commercial_data`-gated master-data list APIs.
 */
export default async function TripsPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user.role, "view_all_trips")) redirect("/");

  const t = await getTranslations("Trips");
  const filterOptions = await getTripFilterOptions();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <ControlTowerTable filterOptions={filterOptions} />
    </div>
  );
}
