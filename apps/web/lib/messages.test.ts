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

  it("has nested + flat labels for the 007 exception / note / sla_rule actions", () => {
    const trip = (messages as { Trips: { auditActions: { trip: Record<string, string> } } }).Trips
      .auditActions.trip;
    const exception = (
      messages as { Trips: { auditActions: { exception: Record<string, string> } } }
    ).Trips.auditActions.exception;
    const slaRule = (messages as { Trips: { auditActions: { sla_rule: Record<string, string> } } })
      .Trips.auditActions.sla_rule;
    const flat = (messages as { AuditActions: Record<string, string> }).AuditActions;

    // nested resolution (next-intl dot-path) for the 007 additions ...
    expect(typeof trip.note).toBe("string");
    for (const a of ["create", "update", "resolve", "cancel"] as const) {
      expect(typeof exception[a]).toBe("string");
      expect(exception[a]).not.toBe("");
    }
    for (const a of ["create", "update"] as const) {
      expect(typeof slaRule[a]).toBe("string");
      expect(slaRule[a]).not.toBe("");
    }
    // ... and the flat `AuditActions` labels the global audit screen looks up via `_`.
    for (const key of [
      "exception_create",
      "exception_update",
      "exception_resolve",
      "exception_cancel",
      "trip_note",
      "sla_rule_create",
      "sla_rule_update",
    ] as const) {
      expect(typeof flat[key]).toBe("string");
      expect(flat[key]).not.toBe("");
    }
  });

  it("has nested + flat labels for the 008 document / requirement / type / rate / billing actions", () => {
    const a = (
      messages as {
        Trips: {
          auditActions: {
            document: Record<string, string>;
            document_requirement: Record<string, string>;
            document_type: Record<string, string>;
            rate: Record<string, string>;
            billing_item: Record<string, string>;
            billing: Record<string, string>;
          };
        };
      }
    ).Trips.auditActions;
    const flat = (messages as { AuditActions: Record<string, string> }).AuditActions;

    // Nested resolution (next-intl dot-path) for the twelve 008 additions.
    for (const k of ["upload", "verify", "waive", "archive"] as const) {
      expect(a.document[k]).toBeTruthy();
    }
    for (const k of ["create", "update"] as const) {
      expect(a.document_requirement[k]).toBeTruthy();
      expect(a.document_type[k]).toBeTruthy();
      expect(a.rate[k]).toBeTruthy();
    }
    expect(a.billing_item.update).toBeTruthy();
    expect(a.billing.export).toBeTruthy();

    // Flat `AuditActions` (global audit screen lookup via action.replaceAll('.','_')).
    for (const key of [
      "document_upload",
      "document_verify",
      "document_waive",
      "document_archive",
      "document_requirement_create",
      "document_requirement_update",
      "document_type_create",
      "document_type_update",
      "rate_create",
      "rate_update",
      "billing_item_update",
      "billing_export",
    ] as const) {
      expect(typeof flat[key]).toBe("string");
      expect(flat[key]).not.toBe("");
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
