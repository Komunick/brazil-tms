import { describe, expect, it } from "vitest";
import type { PortalLeg, PortalStop } from "./portal-execution";
import { hopsToApply, milestonesFor, parsePortalInstant } from "./portal-milestones";

/**
 * Turning the portal's four instants into the trip's lifecycle. The rules that matter are the
 * refusals: nothing is inferred from an absent time, and a file that is behind the TMS moves nothing.
 */

const stop = (over: Partial<PortalStop>): PortalStop => ({
  sequence: 1,
  stationValue: "[8300]SoC_RJ_Duque de Caxias",
  stationId: "8300",
  stationName: "SoC_RJ_Duque de Caxias",
  plannedArrival: null,
  plannedDeparture: null,
  actualArrival: null,
  actualDeparture: null,
  ...over,
});

const leg = (origin: Partial<PortalStop>, destination: Partial<PortalStop>): PortalLeg => ({
  legNumber: 1,
  origin: stop(origin),
  destination: stop({ sequence: 2, stationId: "10102", ...destination }),
});

describe("parsePortalInstant", () => {
  it("reads the portal's wall clock as São Paulo time", () => {
    // 13/08/2026 09:47 BRT (UTC-3) is 12:47 UTC.
    expect(parsePortalInstant("13/08/2026 09:47")?.toISOString()).toBe("2026-08-13T12:47:00.000Z");
  });

  it("accepts seconds when the export carries them", () => {
    expect(parsePortalInstant("13/08/2026 09:47:31")?.toISOString()).toBe(
      "2026-08-13T12:47:31.000Z",
    );
  });

  it("returns null for blank or unreadable — never a guess", () => {
    expect(parsePortalInstant(null)).toBeNull();
    expect(parsePortalInstant("-")).toBeNull();
    expect(parsePortalInstant("13-08-2026 09:47")).toBeNull();
  });
});

describe("milestonesFor", () => {
  it("reads the four instants as the lifecycle points they prove", () => {
    const m = milestonesFor(
      leg(
        { actualArrival: "12/08/2026 22:31", actualDeparture: "12/08/2026 23:53" },
        { actualArrival: "13/08/2026 08:11" },
      ),
    );
    expect(m.map((x) => x.status)).toEqual(["at_origin", "in_transit", "at_destination"]);
    expect(m.map((x) => x.eventType)).toEqual([
      "origin_arrived",
      "departed",
      "destination_arrived",
    ]);
    expect(m[0]!.at.toISOString()).toBe("2026-08-13T01:31:00.000Z");
  });

  it("stops where the truck stopped: a trip mid-route proves only what it reached", () => {
    const m = milestonesFor(leg({ actualArrival: "12/08/2026 22:31" }, {}));
    expect(m.map((x) => x.status)).toEqual(["at_origin"]);
  });

  it("proves nothing when the portal has recorded nothing yet", () => {
    expect(milestonesFor(leg({ plannedArrival: "12/08/2026 22:40" }, {}))).toEqual([]);
  });
});

describe("hopsToApply", () => {
  it("walks the declared machine, stamping the real time only where the portal has one", () => {
    const hops = hopsToApply(
      "assigned",
      milestonesFor(
        leg(
          { actualArrival: "12/08/2026 22:31", actualDeparture: "12/08/2026 23:53" },
          { actualArrival: "13/08/2026 08:11" },
        ),
      ),
    );
    expect(hops.map((h) => h.status)).toEqual([
      "confirmed",
      "at_origin",
      "in_transit",
      "at_destination",
    ]);
    // `confirmed` is only passed through — the portal never timed it, so no time is invented.
    expect(hops[0]!.at).toBeNull();
    expect(hops[0]!.eventType).toBeNull();
    expect(hops[1]!.at?.toISOString()).toBe("2026-08-13T01:31:00.000Z");
    expect(hops[3]!.eventType).toBe("destination_arrived");
  });

  it("moves NOTHING when the trip is already as far as the file proves", () => {
    const m = milestonesFor(leg({ actualArrival: "12/08/2026 22:31" }, {}));
    expect(hopsToApply("at_origin", m)).toEqual([]);
  });

  it("moves NOTHING when the file is behind the TMS — re-importing yesterday is a no-op", () => {
    const m = milestonesFor(leg({ actualArrival: "12/08/2026 22:31" }, {}));
    expect(hopsToApply("in_transit", m)).toEqual([]);
    expect(hopsToApply("completed", m)).toEqual([]);
  });

  it("does nothing at all when the portal proves nothing", () => {
    expect(hopsToApply("received", [])).toEqual([]);
  });

  it("walks THROUGH loading and loaded instead of shortcutting to the furthest milestone", () => {
    // The machine allows at_origin → in_transit directly, so aiming at the furthest milestone alone
    // would silently drop the two loading steps — the very hours this exists to make visible.
    const hops = hopsToApply(
      "at_origin",
      milestonesFor(
        leg(
          {
            actualArrival: "13/08/2026 05:04",
            loadingStarted: "13/08/2026 06:50",
            loadedAt: "13/08/2026 07:16",
            actualDeparture: "13/08/2026 07:16",
          },
          { actualArrival: "13/08/2026 18:30" },
        ),
      ),
    );
    expect(hops.map((h) => h.status)).toEqual([
      "loading",
      "loaded",
      "in_transit",
      "at_destination",
    ]);
    // Each carries the customer's own instant, and `loading` carries no typed event (by design).
    expect(hops[0]!.at?.toISOString()).toBe("2026-08-13T09:50:00.000Z");
    expect(hops[0]!.eventType).toBeNull();
    expect(hops[1]!.eventType).toBe("loaded");
  });

  it("a trip that only started loading stops at loading — nothing beyond is invented", () => {
    const hops = hopsToApply(
      "at_origin",
      milestonesFor(
        leg({ actualArrival: "13/08/2026 05:04", loadingStarted: "13/08/2026 06:50" }, {}),
      ),
    );
    expect(hops.map((h) => h.status)).toEqual(["loading"]);
  });

  it("the spreadsheet export states no loading times, so it produces no loading hops", () => {
    const hops = hopsToApply(
      "at_origin",
      milestonesFor(
        leg({ actualArrival: "13/08/2026 05:04", actualDeparture: "13/08/2026 07:16" }, {}),
      ),
    );
    expect(hops.map((h) => h.status)).toEqual(["in_transit"]);
  });

  it("never routes through cancelled to reach a live status", () => {
    const m = milestonesFor(leg({ actualArrival: "12/08/2026 22:31" }, {}));
    expect(hopsToApply("received", m).some((h) => h.status === "cancelled")).toBe(false);
  });
});
