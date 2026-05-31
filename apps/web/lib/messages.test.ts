import { describe, expect, it } from "vitest";
import { ALL_AUDIT_ACTIONS } from "@brazil-tms/shared";
import messages from "../messages/pt-BR.json";

/**
 * Guard: next-intl forbids "." inside a message key (it is the nesting separator) and throws
 * `INVALID_KEY` at `getMessages()` — which breaks EVERY page render via RootLayout. Trip audit
 * actions are dotted strings (`trip.plan_update`), so they MUST be nested objects, not literal dotted
 * keys. This walks the whole catalog and fails on any key containing a dot. Pure unit — no DB.
 */
function dottedKeys(value: unknown, path = ""): string[] {
  if (value === null || typeof value !== "object") return [];
  const bad: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key;
    if (key.includes(".")) bad.push(here);
    bad.push(...dottedKeys(child, here));
  }
  return bad;
}

describe("pt-BR messages", () => {
  it("has no message key containing '.' (next-intl nesting separator)", () => {
    expect(dottedKeys(messages)).toEqual([]);
  });

  it("resolves nested trip audit actions via the dot-path lookup", () => {
    const auditActions = (messages as { Trips: { auditActions: Record<string, unknown> } }).Trips
      .auditActions;
    expect((auditActions.trip as Record<string, string>).plan_update).toBe("Plano atualizado");
  });

  it("has nested + flat labels for the 006 dispatch-assignment trip actions", () => {
    const trip = (messages as { Trips: { auditActions: { trip: Record<string, string> } } }).Trips
      .auditActions.trip;
    const flat = (messages as { AuditActions: Record<string, string> }).AuditActions;
    for (const action of ["assign", "reassign", "unassign", "confirm"] as const) {
      // nested resolution (next-intl dot-path) ...
      expect(typeof trip[action]).toBe("string");
      expect(trip[action]).not.toBe("");
      // ... and the flat `AuditActions` label the global audit screen looks up via `_`.
      expect(typeof flat[`trip_${action}`]).toBe("string");
      expect(flat[`trip_${action}`]).not.toBe("");
    }
  });

  it("has an AuditActions label for EVERY audit action (global screen uses action.replaceAll('.','_'))", () => {
    const labels = (messages as { AuditActions: Record<string, string> }).AuditActions;
    const missing = ALL_AUDIT_ACTIONS.filter((action) => {
      const key = action.replaceAll(".", "_");
      return typeof labels[key] !== "string" || labels[key] === "";
    });
    expect(missing).toEqual([]);
  });
});
