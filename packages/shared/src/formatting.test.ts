import { describe, expect, it } from "vitest";
import {
  DOCUMENT_EXPIRY_WARNING_DAYS,
  documentExpiryState,
  formatBRL,
} from "./formatting";

describe("documentExpiryState (R9)", () => {
  // Fixed "now" so the test is deterministic (no Date.now()).
  const now = "2026-05-29T12:00:00.000Z";

  it("returns 'ok' when there is no expiry date", () => {
    expect(documentExpiryState(null, now)).toBe("ok");
    expect(documentExpiryState(undefined, now)).toBe("ok");
  });

  it("returns 'expired' for a date in the past", () => {
    expect(documentExpiryState("2026-05-01", now)).toBe("expired");
  });

  it("counts today as 'expired' (day-granular, on/before now)", () => {
    expect(documentExpiryState("2026-05-29", now)).toBe("expired");
  });

  it("returns 'expiring' for a date within the default 30-day window", () => {
    expect(documentExpiryState("2026-06-10", now)).toBe("expiring");
    // Boundary: exactly the window edge is still 'expiring'.
    expect(documentExpiryState("2026-06-28", now)).toBe("expiring");
  });

  it("returns 'ok' for a date beyond the window", () => {
    expect(documentExpiryState("2026-08-01", now)).toBe("ok");
  });

  it("honors a custom window", () => {
    expect(documentExpiryState("2026-06-05", now, 3)).toBe("ok");
    expect(documentExpiryState("2026-06-01", now, 3)).toBe("expiring");
  });

  it("exposes the default window as the single config source", () => {
    expect(DOCUMENT_EXPIRY_WARNING_DAYS).toBe(30);
  });
});

describe("formatBRL", () => {
  it("formats integer centavos as BRL", () => {
    // Non-breaking spaces in the Intl output — assert on the digits/symbol loosely.
    expect(formatBRL(123456)).toContain("1.234,56");
    expect(formatBRL(0)).toContain("0,00");
  });
});
