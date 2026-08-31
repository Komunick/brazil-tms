import { describe, expect, it } from "vitest";
import type { PermissionKey } from "@brazil-tms/shared";
import {
  SET_PASSWORD_PATH,
  decideAccess,
  evaluateProfile,
  isOnboardingIncomplete,
  resolvePostLoginTarget,
  toUserStatus,
  type ProfileRow,
  type SessionResult,
  type SessionUser,
} from "./session-core";

const baseProfile: ProfileRow = {
  id: "u1",
  name: "Teste",
  email: "teste@example.com",
  role: "dispatcher",
  status: "active",
  mustChangePassword: false,
  lastLoginAt: null,
  // O cargo entrou na fatia 029; a lista vem do `join` da sessão.
  permissoes: ["view_all_trips"],
  cargo: "Despachante",
};

/**
 * A LINHA DO BANCO e o USUÁRIO DA SESSÃO deixaram de ter a mesma forma (fatia 029).
 *
 * `ProfileRow.permissoes` é a lista que vem do `array_agg`; `SessionUser.permissoes` é o conjunto
 * que `can` consulta. Espalhar um no outro funcionava enquanto os dois eram idênticos, e agora o
 * compilador cobra a diferença — que é justamente a conversão que `evaluateProfile` faz.
 */
const baseUser: SessionUser = {
  ...baseProfile,
  status: "active",
  permissoes: new Set<PermissionKey>(["view_all_trips"]),
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

describe("isOnboardingIncomplete (BFF + shell gate)", () => {
  const mkUser = (over: Partial<SessionUser> = {}): SessionUser => ({
    id: "u1",
    name: "Teste",
    email: "teste@example.com",
    role: "dispatcher",
    permissoes: new Set<PermissionKey>(["view_all_trips"]),
    cargo: "Despachante",
    status: "active",
    mustChangePassword: false,
    lastLoginAt: null,
    ...over,
  });

  it("true when the user must change password (temp-password path)", () => {
    expect(isOnboardingIncomplete(mkUser({ mustChangePassword: true }))).toBe(true);
  });
  it("true when the user is still pending (invite not completed)", () => {
    expect(isOnboardingIncomplete(mkUser({ status: "pending" }))).toBe(true);
  });
  it("false for an active user who does not need a change", () => {
    expect(isOnboardingIncomplete(mkUser())).toBe(false);
  });
});

describe("decideAccess — must_change_password gating (FR-013a)", () => {
  const authed = (mustChange: boolean): SessionResult => ({
    authenticated: true,
    user: { ...baseUser, status: "active", mustChangePassword: mustChange },
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

  it("pending user (invite not yet completed) on a normal route → redirect_set_password", () => {
    const pending: SessionResult = {
      authenticated: true,
      user: { ...baseUser, status: "pending", mustChangePassword: false },
    };
    expect(decideAccess(pending)).toBe("redirect_set_password");
  });

  it("pending user on the password-flow route → allow", () => {
    const pending: SessionResult = {
      authenticated: true,
      user: { ...baseUser, status: "pending", mustChangePassword: false },
    };
    expect(decideAccess(pending, { isPasswordFlowRoute: true })).toBe("allow");
  });
});

describe("resolvePostLoginTarget — the forced password change wins (FR-013a)", () => {
  it("a leftover ?redirectTo= never skips the forced password flow", () => {
    expect(resolvePostLoginTarget("/trips", SET_PASSWORD_PATH)).toBe(SET_PASSWORD_PATH);
  });

  it("honours the requested path for a user who owes no password change", () => {
    expect(resolvePostLoginTarget("/trips", "/")).toBe("/trips");
  });

  it("falls back to the server target when nothing was requested", () => {
    expect(resolvePostLoginTarget(null, "/")).toBe("/");
  });

  it("rejects an absolute URL (open redirect)", () => {
    expect(resolvePostLoginTarget("https://evil.example/x", "/")).toBe("/");
  });

  it("rejects a protocol-relative URL (open redirect)", () => {
    expect(resolvePostLoginTarget("//evil.example/x", "/")).toBe("/");
  });
});
