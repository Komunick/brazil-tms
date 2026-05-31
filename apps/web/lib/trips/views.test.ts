import { describe, expect, it } from "vitest";
import { DEFAULT_TRIP_VIEWS } from "./views";

/**
 * Unit test for the default board view presets (feature 005). Pure — no DB. Guards the regression
 * where, under AND `status`∩`billingStatus` filtering, a preset that sets only one of the two left a
 * stale value of the other in the URL and yielded an empty board.
 *
 * `applyView` mirrors `useTripBoardFilters().setFilters`' merge: each key is deleted, then re-set only
 * when its value is non-empty (an empty string clears the key).
 */
function applyView(current: string, params: Record<string, string>): URLSearchParams {
  const out = new URLSearchParams(current);
  for (const [key, value] of Object.entries(params)) {
    out.delete(key);
    if (value !== "") out.set(key, value);
  }
  return out;
}

function view(key: string) {
  const found = DEFAULT_TRIP_VIEWS.find((v) => v.key === key);
  if (!found) throw new Error(`no view ${key}`);
  return found;
}

describe("DEFAULT_TRIP_VIEWS — presets clear mutually-exclusive status/billing keys", () => {
  it("'In transit' over a lingering billingStatus clears billingStatus (no empty AND board)", () => {
    const result = applyView(
      "billingStatus=billing_pending&customerId=abc",
      view("inTransit").params(),
    );
    expect(result.get("status")).toBe("in_transit");
    expect(result.get("billingStatus")).toBeNull(); // cleared
    expect(result.get("customerId")).toBe("abc"); // orthogonal filter preserved
    expect(result.get("scope")).toBe("all");
  });

  it("'Billing pending' over a lingering status clears status", () => {
    const result = applyView("status=in_transit&status=assigned", view("billingPending").params());
    expect(result.get("billingStatus")).toBe("billing_pending");
    expect(result.getAll("status")).toEqual([]); // all status values cleared
    expect(result.get("scope")).toBe("all");
  });

  it("date presets set a pickup range + scope and do not introduce a status/billing conflict", () => {
    for (const key of ["today", "next24h"]) {
      const p = view(key).params();
      expect(p.pickupFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.pickupTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.scope).toBe("all");
      expect(p.status).toBeUndefined();
      expect(p.billingStatus).toBeUndefined();
    }
  });
});
