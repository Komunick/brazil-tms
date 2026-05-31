import { redirect } from "next/navigation";
import { can } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { TripDetailClient } from "@/components/trips/trip-detail/trip-detail-client";

/**
 * Trip Detail page (005 US2/US3). Server guard: reuses the pre-declared `view_all_trips` permission
 * (enforced for the first time by 005). Reads/edits flow through the BFF; the page itself only gates
 * access and hands the id to the polling client.
 */
export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user.role, "view_all_trips")) redirect("/");

  const { id } = await params;
  return <TripDetailClient id={id} />;
}
