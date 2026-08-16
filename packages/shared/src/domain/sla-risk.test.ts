import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLA_POLICY,
  deliveryDeadline,
  evaluateSlaRisk,
  SLA_REASONS,
  SLA_STATUSES,
  type SlaContext,
} from "./sla-risk";
import type { TripStatus } from "./trip-status";

/**
 * Unit tests for the pure SLA-risk evaluator (data-model §9.1). Covers the D1 trigger→state map for
 * each of the 7 reasons, D2 worst-state-wins, the no-planned-window branch, the time-in-status branch,
 * the terminal/cancelled short-circuit, Breached-never-in-MVP, and the DEFAULT_SLA_POLICY magnitudes.
 * Pure — no DB.
 */

const HOUR = 3_600_000;
const NOW = new Date("2026-06-01T12:00:00.000Z");

/** A baseline On-Track context: assigned + confirmed, before the pickup window, no exceptions. */
function baseCtx(overrides: Partial<SlaContext> = {}): SlaContext {
  return {
    now: NOW,
    currentStatus: "confirmed",
    plannedPickupWindowStart: new Date(NOW.getTime() + 6 * HOUR),
    plannedPickupWindowEnd: new Date(NOW.getTime() + 7 * HOUR),
    plannedDeliveryWindowStart: new Date(NOW.getTime() + 12 * HOUR),
    plannedDeliveryWindowEnd: new Date(NOW.getTime() + 13 * HOUR),
    confirmedAt: new Date(NOW.getTime() - HOUR),
    assignmentPresent: true,
    openHighSeverityExceptionCount: 0,
    currentStatusEnteredAt: new Date(NOW.getTime() - HOUR),
    ...overrides,
  };
}

describe("SLA value sets", () => {
  it("SLA_STATUSES is the four-value severity ladder (ordinal = severity)", () => {
    expect(SLA_STATUSES).toEqual(["on_track", "at_risk", "late", "breached"]);
  });

  it("SLA_REASONS holds the seven triggers", () => {
    expect(SLA_REASONS).toHaveLength(7);
    expect(SLA_REASONS).toContain("missing_assignment");
    expect(SLA_REASONS).toContain("open_high_severity_exception");
  });

  it("DEFAULT_SLA_POLICY has the labeled magnitudes (60/0/0/120/120)", () => {
    expect(DEFAULT_SLA_POLICY).toEqual({
      atRiskWarningMinutes: 60,
      pickupToleranceMinutes: 0,
      deliveryToleranceMinutes: 0,
      confirmationCutoffMinutes: 120,
      timeInStatusThresholdMinutes: 120,
    });
  });
});

describe("evaluateSlaRisk — baseline On Track", () => {
  it("returns on_track with no reasons when nothing has fired", () => {
    const r = evaluateSlaRisk(baseCtx());
    expect(r.status).toBe("on_track");
    expect(r.reasons).toEqual([]);
  });
});

describe("evaluateSlaRisk — D1 trigger→state map (each of the 7 reasons)", () => {
  it("missing_assignment ⇒ At Risk (no assignment past the confirmation cutoff)", () => {
    const r = evaluateSlaRisk(
      baseCtx({
        assignmentPresent: false,
        confirmedAt: null,
        // pickup in 1h, cutoff 120m ⇒ deadline already passed.
        plannedPickupWindowStart: new Date(NOW.getTime() + HOUR),
      }),
    );
    expect(r.reasons).toContain("missing_assignment");
    expect(r.status).toBe("at_risk");
  });

  it("missed_confirmation ⇒ At Risk (assigned but unconfirmed past the cutoff)", () => {
    const r = evaluateSlaRisk(
      baseCtx({
        assignmentPresent: true,
        confirmedAt: null,
        plannedPickupWindowStart: new Date(NOW.getTime() + HOUR),
      }),
    );
    expect(r.reasons).toContain("missed_confirmation");
    expect(r.status).toBe("at_risk");
  });

  it("delayed_origin_arrival ⇒ Late (past pickup window, not yet at origin)", () => {
    const r = evaluateSlaRisk(
      baseCtx({
        currentStatus: "confirmed",
        plannedPickupWindowStart: new Date(NOW.getTime() - 3 * HOUR),
        plannedPickupWindowEnd: new Date(NOW.getTime() - 2 * HOUR),
      }),
    );
    expect(r.reasons).toContain("delayed_origin_arrival");
    expect(r.status).toBe("late");
  });

  it("delayed_loading ⇒ At Risk (stuck in loading past the time-in-status threshold)", () => {
    const r = evaluateSlaRisk(
      baseCtx({
        currentStatus: "loading",
        currentStatusEnteredAt: new Date(NOW.getTime() - 3 * HOUR), // > 120 min
        plannedPickupWindowStart: new Date(NOW.getTime() - 4 * HOUR),
        plannedPickupWindowEnd: new Date(NOW.getTime() - 3 * HOUR),
        plannedDeliveryWindowEnd: new Date(NOW.getTime() + 13 * HOUR),
      }),
    );
    expect(r.reasons).toContain("delayed_loading");
  });

  it("delayed_departure ⇒ At Risk (loaded but not departed past the threshold)", () => {
    const r = evaluateSlaRisk(
      baseCtx({
        currentStatus: "loaded",
        currentStatusEnteredAt: new Date(NOW.getTime() - 3 * HOUR),
        plannedDeliveryWindowEnd: new Date(NOW.getTime() + 13 * HOUR),
      }),
    );
    expect(r.reasons).toContain("delayed_departure");
  });

  it("delayed_destination_arrival ⇒ Late (past delivery window, not yet at destination)", () => {
    const r = evaluateSlaRisk(
      baseCtx({
        currentStatus: "in_transit",
        plannedPickupWindowEnd: new Date(NOW.getTime() - 10 * HOUR),
        plannedDeliveryWindowStart: new Date(NOW.getTime() - 3 * HOUR),
        plannedDeliveryWindowEnd: new Date(NOW.getTime() - 2 * HOUR),
        currentStatusEnteredAt: new Date(NOW.getTime() - HOUR),
      }),
    );
    expect(r.reasons).toContain("delayed_destination_arrival");
    expect(r.status).toBe("late");
  });

  it("open_high_severity_exception ⇒ At Risk", () => {
    const r = evaluateSlaRisk(baseCtx({ openHighSeverityExceptionCount: 1 }));
    expect(r.reasons).toContain("open_high_severity_exception");
    expect(r.status).toBe("at_risk");
  });
});

describe("evaluateSlaRisk — D2 worst-state-wins", () => {
  it("Late beats At Risk and retains ALL fired reasons", () => {
    const r = evaluateSlaRisk(
      baseCtx({
        currentStatus: "confirmed",
        // both a window-miss (Late) and a high-sev exception (At Risk) fire.
        plannedPickupWindowStart: new Date(NOW.getTime() - 3 * HOUR),
        plannedPickupWindowEnd: new Date(NOW.getTime() - 2 * HOUR),
        openHighSeverityExceptionCount: 2,
      }),
    );
    expect(r.status).toBe("late");
    expect(r.reasons).toContain("delayed_origin_arrival");
    expect(r.reasons).toContain("open_high_severity_exception");
  });

  it("reasons come out in canonical SLA_REASONS order", () => {
    const r = evaluateSlaRisk(
      baseCtx({
        assignmentPresent: false,
        confirmedAt: null,
        plannedPickupWindowStart: new Date(NOW.getTime() - 3 * HOUR),
        plannedPickupWindowEnd: new Date(NOW.getTime() - 2 * HOUR),
        openHighSeverityExceptionCount: 1,
      }),
    );
    const orderInCanon = r.reasons.map((x) => SLA_REASONS.indexOf(x));
    expect(orderInCanon).toEqual([...orderInCanon].sort((a, b) => a - b));
  });
});

describe("evaluateSlaRisk — branches", () => {
  it("no-planned-window: a null pickup window skips the window-based legs but still checks exceptions", () => {
    const r = evaluateSlaRisk(
      baseCtx({
        plannedPickupWindowStart: null,
        plannedPickupWindowEnd: null,
        plannedDeliveryWindowStart: null,
        plannedDeliveryWindowEnd: null,
        assignmentPresent: false,
        confirmedAt: null,
        openHighSeverityExceptionCount: 1,
      }),
    );
    // missing_assignment needs the pickup window (no deadline) → only the exception fires.
    expect(r.reasons).toEqual(["open_high_severity_exception"]);
    expect(r.status).toBe("at_risk");
  });

  it("terminal/cancelled short-circuits to on_track with no reasons (no evaluation)", () => {
    for (const status of ["completed", "cancelled", "billed", "disputed"] as TripStatus[]) {
      const r = evaluateSlaRisk(
        baseCtx({
          currentStatus: status,
          assignmentPresent: false,
          confirmedAt: null,
          openHighSeverityExceptionCount: 5,
          plannedPickupWindowEnd: new Date(NOW.getTime() - 10 * HOUR),
        }),
      );
      expect(r.status).toBe("on_track");
      expect(r.reasons).toEqual([]);
    }
  });

  it("Breached is never produced in the MVP (no trigger maps to it)", () => {
    // Drive every possible trigger at once; the worst attainable state is Late.
    const r = evaluateSlaRisk(
      baseCtx({
        currentStatus: "confirmed",
        assignmentPresent: false,
        confirmedAt: null,
        plannedPickupWindowStart: new Date(NOW.getTime() - 5 * HOUR),
        plannedPickupWindowEnd: new Date(NOW.getTime() - 4 * HOUR),
        plannedDeliveryWindowEnd: new Date(NOW.getTime() - 2 * HOUR),
        openHighSeverityExceptionCount: 3,
      }),
    );
    expect(r.status).not.toBe("breached");
  });
});

describe("as duas cobranças de atribuição param quando o caminhão sai", () => {
  const semAtribuicao = {
    assignmentPresent: false,
    confirmedAt: null,
    plannedPickupWindowStart: new Date(NOW.getTime() - 5 * HOUR),
  } as const;

  it("cobra antes de sair", () => {
    const r = evaluateSlaRisk(baseCtx({ ...semAtribuicao, currentStatus: "confirmed" }));
    expect(r.reasons).toContain("missing_assignment");
  });

  it("cala depois de sair — a decisão já passou", () => {
    // O caso real: 244 alertas dizendo "sem atribuição" para viagens JÁ ENTREGUES.
    for (const status of ["in_transit", "at_destination", "unloaded"] as TripStatus[]) {
      const r = evaluateSlaRisk(baseCtx({ ...semAtribuicao, currentStatus: status }));
      expect(r.reasons).not.toContain("missing_assignment");
      expect(r.reasons).not.toContain("missed_confirmation");
    }
  });

  it("o mesmo vale para a confirmação pendente", () => {
    const antes = evaluateSlaRisk(
      baseCtx({
        assignmentPresent: true,
        confirmedAt: null,
        currentStatus: "assigned",
        plannedPickupWindowStart: new Date(NOW.getTime() - 5 * HOUR),
      }),
    );
    expect(antes.reasons).toContain("missed_confirmation");
  });
});

describe("deliveryDeadline — where the destination deadline comes from", () => {
  const DEPARTURE = new Date(NOW.getTime() - 4 * HOUR);

  it("prefers the customer's stated window end over everything else", () => {
    const end = new Date(NOW.getTime() + 3 * HOUR);
    expect(
      deliveryDeadline(
        baseCtx({
          plannedDeliveryWindowEnd: end,
          plannedDeliveryWindowStart: new Date(NOW.getTime() + HOUR),
          laneExpectedTransitMinutes: 60,
        }),
      ),
    ).toEqual(end);
  });

  it("falls back to the stated arrival — a promise made as an instant still outranks our average", () => {
    const arrival = new Date(NOW.getTime() + HOUR);
    expect(
      deliveryDeadline(
        baseCtx({
          plannedDeliveryWindowEnd: null,
          plannedDeliveryWindowStart: arrival,
          laneExpectedTransitMinutes: 60,
        }),
      ),
    ).toEqual(arrival);
  });

  it("derives departure + the lane's measured transit when the customer stated no delivery time", () => {
    const deadline = deliveryDeadline(
      baseCtx({
        plannedDeliveryWindowEnd: null,
        plannedDeliveryWindowStart: null,
        plannedPickupWindowEnd: DEPARTURE,
        laneExpectedTransitMinutes: 180,
      }),
    );
    expect(deadline).toEqual(new Date(DEPARTURE.getTime() + 3 * HOUR));
  });

  it("stays silent rather than guessing: no stated time and no measured lane ⇒ no deadline", () => {
    for (const transit of [null, 0]) {
      expect(
        deliveryDeadline(
          baseCtx({
            plannedDeliveryWindowEnd: null,
            plannedDeliveryWindowStart: null,
            laneExpectedTransitMinutes: transit,
          }),
        ),
      ).toBeNull();
    }
    // A measured lane with no departure to count from is equally unanswerable.
    expect(
      deliveryDeadline(
        baseCtx({
          plannedDeliveryWindowEnd: null,
          plannedDeliveryWindowStart: null,
          plannedPickupWindowStart: null,
          plannedPickupWindowEnd: null,
          laneExpectedTransitMinutes: 180,
        }),
      ),
    ).toBeNull();
  });

  it("a trip with no stated delivery time IS late against the lane's transit (was invisible before)", () => {
    const late = evaluateSlaRisk(
      baseCtx({
        currentStatus: "in_transit",
        plannedDeliveryWindowEnd: null,
        plannedDeliveryWindowStart: null,
        plannedPickupWindowStart: new Date(NOW.getTime() - 5 * HOUR),
        plannedPickupWindowEnd: DEPARTURE,
        laneExpectedTransitMinutes: 120, // due 2h after departure ⇒ 2h ago
      }),
    );
    expect(late.reasons).toContain("delayed_destination_arrival");
    expect(late.status).toBe("late");

    // Still within the lane's usual transit ⇒ nothing fires.
    const onTime = evaluateSlaRisk(
      baseCtx({
        currentStatus: "in_transit",
        plannedDeliveryWindowEnd: null,
        plannedDeliveryWindowStart: null,
        plannedPickupWindowStart: new Date(NOW.getTime() - 5 * HOUR),
        plannedPickupWindowEnd: DEPARTURE,
        laneExpectedTransitMinutes: 600,
      }),
    );
    expect(onTime.reasons).not.toContain("delayed_destination_arrival");
  });
});

describe("evaluateSlaRisk — policy override", () => {
  it("a larger confirmation cutoff fires missing_assignment earlier", () => {
    const ctx = baseCtx({
      assignmentPresent: false,
      confirmedAt: null,
      plannedPickupWindowStart: new Date(NOW.getTime() + 3 * HOUR), // 180 min out
    });
    // Default cutoff 120m ⇒ deadline is pickup-120m = 60m ahead ⇒ not yet fired.
    expect(evaluateSlaRisk(ctx).reasons).not.toContain("missing_assignment");
    // Cutoff 240m ⇒ deadline already passed ⇒ fires.
    const r = evaluateSlaRisk(ctx, { ...DEFAULT_SLA_POLICY, confirmationCutoffMinutes: 240 });
    expect(r.reasons).toContain("missing_assignment");
  });
});
