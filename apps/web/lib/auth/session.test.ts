import { describe, expect, it } from "vitest";
import {
  decideAccess,
  evaluateProfile,
  toUserStatus,
  type ProfileRow,
  type SessionResult,
} from "./session-core";

const baseProfile: ProfileRow = {
  id: "u1",
  name: "Teste",
  email: "teste@example.com",
  role: "dispatcher",
  status: "active",
  mustChangePassword: false,
  lastLoginAt: null,
};

describe("evaluateProfile — status gating", () => {
  it("no auth user → no_session", () => {
    expect(evaluateProfile(null, null)).toEqual({ authenticated: false, reason: "no_session" });
  });

  it("auth user but no profile → no_profile", () => {
    expect(evaluateProfile("u1", null)).toEqual({ authenticated: false, reason: "no_profile" });
  });

  it("disabled profile → blocked (SC-007)", () => {
    const result = evaluateProfile("u1", { ...baseProfile, status: "disabled" });
    expect(result).toEqual({ authenticated: false, reason: "disabled" });
  });

  it("active profile → authenticated", () => {
    const result = evaluateProfile("u1", baseProfile);
    expect(result.authenticated).toBe(true);
  });

  it("pending profile → authenticated (can reach the app to complete onboarding)", () => {
    const result = evaluateProfile("u1", { ...baseProfile, status: "pending" });
    expect(result.authenticated).toBe(true);
    if (result.authenticated) expect(result.user.status).toBe("pending");
  });
});

describe("toUserStatus", () => {
  it("passes through known statuses", () => {
    expect(toUserStatus("active")).toBe("active");
    expect(toUserStatus("pending")).toBe("pending");
    expect(toUserStatus("disabled")).toBe("disabled");
  });
  it("treats unknown status as disabled (fail closed)", () => {
    expect(toUserStatus("weird")).toBe("disabled");
  });
});

describe("decideAccess — must_change_password gating (FR-013a)", () => {
  const authed = (mustChange: boolean): SessionResult => ({
    authenticated: true,
    user: { ...baseProfile, status: "active", mustChangePassword: mustChange },
  });

  it("unauthenticated → redirect_login", () => {
    expect(decideAccess({ authenticated: false, reason: "no_session" })).toBe("redirect_login");
  });

  it("must_change_password on a normal route → redirect_set_password", () => {
    expect(decideAccess(authed(true))).toBe("redirect_set_password");
  });

  it("must_change_password on the password-flow route → allow", () => {
    expect(decideAccess(authed(true), { isPasswordFlowRoute: true })).toBe("allow");
  });

  it("normal authenticated user → allow", () => {
    expect(decideAccess(authed(false))).toBe("allow");
  });
});
