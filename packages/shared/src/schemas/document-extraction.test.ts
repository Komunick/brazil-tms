import { describe, expect, it } from "vitest";
import {
  cnhExtractionSchema,
  crlvExtractionSchema,
  extractDocumentRequestSchema,
  unreadableFields,
} from "./document-extraction";

/** Pure unit tests for the 021 extraction schemas (FR-003 null-over-guess; request limits). */
describe("cnhExtractionSchema", () => {
  it("accepts a full read and a fully-unreadable read alike", () => {
    const full = {
      name: "João da Silva",
      licenseNumber: "12345678901",
      licenseCategory: "AE",
      licenseExpiry: "2028-05-01",
    };
    expect(cnhExtractionSchema.parse(full)).toEqual(full);
    const empty = { name: null, licenseNumber: null, licenseCategory: null, licenseExpiry: null };
    expect(cnhExtractionSchema.parse(empty)).toEqual(empty);
  });

  it("rejects a malformed date (the model must emit YYYY-MM-DD or null)", () => {
    expect(() =>
      cnhExtractionSchema.parse({
        name: "X",
        licenseNumber: null,
        licenseCategory: null,
        licenseExpiry: "01/05/2028",
      }),
    ).toThrow();
  });
});

describe("crlvExtractionSchema", () => {
  it("constrains vehicleType to the existing catalog (null when unmappable)", () => {
    expect(() =>
      crlvExtractionSchema.parse({ plate: "ABC1D23", vehicleType: "espacial", documentExpiry: null }),
    ).toThrow();
    expect(
      crlvExtractionSchema.parse({ plate: "ABC1D23", vehicleType: null, documentExpiry: null })
        .vehicleType,
    ).toBeNull();
  });
});

describe("extractDocumentRequestSchema", () => {
  it("accepts images and pdf; rejects unknown media types and empty payloads", () => {
    expect(
      extractDocumentRequestSchema.parse({ docType: "cnh", mediaType: "image/jpeg", data: "aGk=" })
        .docType,
    ).toBe("cnh");
    expect(() =>
      extractDocumentRequestSchema.parse({ docType: "cnh", mediaType: "text/plain", data: "aGk=" }),
    ).toThrow();
    expect(() =>
      extractDocumentRequestSchema.parse({ docType: "crlv", mediaType: "image/png", data: "" }),
    ).toThrow();
  });
});

describe("unreadableFields", () => {
  it("lists exactly the null fields", () => {
    expect(unreadableFields({ a: null, b: "x", c: null })).toEqual(["a", "c"]);
    expect(unreadableFields({ a: "x" })).toEqual([]);
  });
});
