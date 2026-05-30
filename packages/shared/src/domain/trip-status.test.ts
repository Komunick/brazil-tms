import { describe, expect, it } from "vitest";
import {
  BILLING_PHASE_STATUSES,
  TRANSITIONS,
  TRIP_CRITICAL_FIELDS,
  TRIP_STATUSES,
  billingStatus,
  canTransition,
  type TripStatus,
} from "./trip-status";

/**
 * Pure unit tests for the single trip domain model (FR-008..FR-013, FR-016). No DB. This module is
 * the source of truth slices 004–009 import, so its legality table, projection, and critical-field
 * set are pinned here. Billing-projection assertions (US5, T031) are appended in the dedicated block
 * at the bottom.
 */

describe("TRIP_STATUSES", () => {
  it("has exactly the 18 spec statuses", () => {
    expect(TRIP_STATUSES).toHaveLength(18);
  });

  it("does NOT contain 'warning' — a validation warning is an attention flag, not a status (FR-012)", () => {
    expect((TRIP_STATUSES as readonly string[]).includes("warning")).toBe(false);
  });
});

describe("canTransition — every declared legal transition is accepted", () => {
  for (const from of TRIP_STATUSES) {
    for (const to of TRANSITIONS[from]) {
      it(`${from} → ${to} is legal`, () => {
        expect(canTransition(from, to)).toBe(true);
      });
    }
  }
});

describe("canTransition — illegal transitions are rejected", () => {
  it("received → in_transit is illegal (must pass through validation/assignment)", () => {
    expect(canTransition("received", "in_transit")).toBe(false);
  });

  it("received → completed is illegal", () => {
    expect(canTransition("received", "completed")).toBe(false);
  });

  it("validated → confirmed is illegal (must be assigned first)", () => {
    expect(canTransition("validated", "confirmed")).toBe(false);
  });

  it("billing_pending → billed is illegal (must pass through billing_ready)", () => {
    expect(canTransition("billing_pending", "billed")).toBe(false);
  });
});

describe("optional sub-states may be skipped (FR-010)", () => {
  it("at_origin → in_transit (skip loading) is legal", () => {
    expect(canTransition("at_origin", "in_transit")).toBe(true);
  });

  it("at_destination → unloaded (skip unloading) is legal", () => {
    expect(canTransition("at_destination", "unloaded")).toBe(true);
  });
});

describe("cancellation availability (clarification 2026-05-29: legal through at_destination)", () => {
  it("in_transit → cancelled is legal", () => {
    expect(canTransition("in_transit", "cancelled")).toBe(true);
  });

  it("at_destination → cancelled is legal", () => {
    expect(canTransition("at_destination", "cancelled")).toBe(true);
  });

  it("unloaded → cancelled is illegal (past the cancellable window)", () => {
    expect(canTransition("unloaded", "cancelled")).toBe(false);
  });

  it("completed → cancelled is illegal", () => {
    expect(canTransition("completed", "cancelled")).toBe(false);
  });
});

describe("cancelled is terminal", () => {
  it("has no outgoing transitions", () => {
    expect(TRANSITIONS.cancelled).toHaveLength(0);
  });

  it("cannot transition to any other status", () => {
    for (const to of TRIP_STATUSES) {
      expect(canTransition("cancelled", to)).toBe(false);
    }
  });
});

describe("disputed round-trip (FR-011)", () => {
  it("disputed → cancelled is legal (static)", () => {
    expect(canTransition("disputed", "cancelled")).toBe(true);
  });

  it("disputed → its disputed_from_status is legal when supplied", () => {
    expect(canTransition("disputed", "billing_ready", { disputedFromStatus: "billing_ready" })).toBe(
      true,
    );
  });

  it("disputed → an arbitrary status is illegal without the matching disputed_from_status", () => {
    expect(canTransition("disputed", "billing_ready")).toBe(false);
    expect(canTransition("disputed", "completed", { disputedFromStatus: "billing_ready" })).toBe(
      false,
    );
  });
});

describe("TRIP_CRITICAL_FIELDS (R9, FR-016)", () => {
  it("includes the planned windows, vehicle type, status, billing projection, and cancellation reason", () => {
    for (const field of [
      "plannedPickupWindowStart",
      "plannedPickupWindowEnd",
      "plannedDeliveryWindowStart",
      "plannedDeliveryWindowEnd",
      "plannedVehicleType",
      "currentStatus",
      "billingStatus",
      "cancellationReasonCode",
    ]) {
      expect(TRIP_CRITICAL_FIELDS as readonly string[]).toContain(field);
    }
  });

  it("does NOT include non-critical descriptive fields (route notes, volume)", () => {
    expect(TRIP_CRITICAL_FIELDS as readonly string[]).not.toContain("plannedRouteNotes");
    expect(TRIP_CRITICAL_FIELDS as readonly string[]).not.toContain("plannedVolumeUnits");
  });
});

// ---------------------------------------------------------------------------
// US5 (T031) — billing-phase projection lives only in the single TRANSITIONS table
// ---------------------------------------------------------------------------

describe("billingStatus projection (US5, FR-013, SC-005)", () => {
  it("every billing-phase status projects to itself", () => {
    for (const s of BILLING_PHASE_STATUSES) {
      expect(billingStatus(s)).toBe(s);
    }
  });

  it("every non-billing status projects to null", () => {
    const billingPhase = new Set<TripStatus>(BILLING_PHASE_STATUSES);
    for (const s of TRIP_STATUSES) {
      if (!billingPhase.has(s)) {
        expect(billingStatus(s)).toBeNull();
      }
    }
  });

  it("the billing-phase transitions exist only within the single TRANSITIONS table (no second machine)", () => {
    // completed → billing_pending → billing_ready → billed is the tail of the ONE machine.
    expect(canTransition("completed", "billing_pending")).toBe(true);
    expect(canTransition("billing_pending", "billing_ready")).toBe(true);
    expect(canTransition("billing_ready", "billed")).toBe(true);
    // and gating predicates are NOT enforced here (deferred to 008) — these are pure data transitions.
  });
});
