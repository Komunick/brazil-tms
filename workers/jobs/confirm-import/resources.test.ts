import { describe, expect, it } from "vitest";
import {
  hasResourceRequest,
  resolveResources,
  resourceRequestFrom,
  type ResourceIndex,
} from "./resources";

/**
 * Resolution of the `resource.*` columns against the fleet registry — the pure half of the import's
 * resource linking (the assignment itself goes through `assignTrip`, covered by the DB-backed suite).
 * The cases mirror the real file: a CPF column that exports empty (it is a VLOOKUP), two drivers
 * sharing one CPF, and a trailer the registry has never seen.
 */

const index: ResourceIndex = {
  driversByCpf: new Map([
    ["39053344705", [{ id: "d1", name: "JOÃO CARLOS", carrierId: "c1" }]],
    [
      "05629423606",
      [
        { id: "d2", name: "ALISSON RODRIGUES", carrierId: "c1" },
        { id: "d3", name: "WELITON LUIZ SIMIAO", carrierId: "c1" },
      ],
    ],
  ]),
  driversByName: new Map([
    ["JOAO CARLOS", { id: "d1", carrierId: "c1" }],
    ["ALISSON RODRIGUES", { id: "d2", carrierId: "c1" }],
    ["WELITON LUIZ SIMIAO", { id: "d3", carrierId: "c1" }],
  ]),
  vehiclesByPlate: new Map([["EMU7F18", { id: "v1", carrierId: "c1" }]]),
  trailersByPlate: new Map([["OUR5C25", { id: "t1" }]]),
};

describe("resourceRequestFrom", () => {
  it("reads the resource.* keys the engine stored, ignoring the rest", () => {
    const request = resourceRequestFrom({
      externalTripId: "LT0Q71029Q6D1",
      "resource.driverName": " JOÃO CARLOS ",
      "resource.vehiclePlate": "EMU7F18",
      "customer.Região": "SUDESTE",
    });
    expect(request).toEqual({
      driverName: "JOÃO CARLOS",
      driverCpf: null,
      vehiclePlate: "EMU7F18",
      trailerPlate: null,
    });
  });

  it("treats a row with no resource column as nothing to link", () => {
    expect(hasResourceRequest(resourceRequestFrom({ externalTripId: "X" }))).toBe(false);
  });
});

describe("resolveResources", () => {
  it("matches by name when the CPF column exported empty (the usual case)", () => {
    const resolved = resolveResources(index, {
      driverName: "joão carlos",
      driverCpf: null,
      vehiclePlate: "emu7f18",
      trailerPlate: "OUR-5C25",
    });
    expect(resolved.driver?.id).toBe("d1");
    expect(resolved.vehicle?.id).toBe("v1");
    expect(resolved.trailerId).toBe("t1");
    expect(resolved.missing).toEqual([]);
  });

  it("uses the CPF when it comes filled", () => {
    const resolved = resolveResources(index, {
      driverName: null,
      driverCpf: "390.533.447-05",
      vehiclePlate: "EMU7F18",
      trailerPlate: null,
    });
    expect(resolved.driver?.id).toBe("d1");
  });

  it("needs the name to disambiguate a CPF shared by two people", () => {
    const ambiguous = resolveResources(index, {
      driverName: null,
      driverCpf: "05629423606",
      vehiclePlate: "EMU7F18",
      trailerPlate: null,
    });
    expect(ambiguous.driver).toBeUndefined();
    expect(ambiguous.missing[0]).toContain("motorista");

    const disambiguated = resolveResources(index, {
      driverName: "WELITON LUIZ SIMIAO",
      driverCpf: "05629423606",
      vehiclePlate: "EMU7F18",
      trailerPlate: null,
    });
    expect(disambiguated.driver?.id).toBe("d3");
  });

  it("reports what the registry does not have, naming it", () => {
    const resolved = resolveResources(index, {
      driverName: "FULANO DESCONHECIDO",
      driverCpf: null,
      vehiclePlate: "XYZ9A99",
      trailerPlate: null,
    });
    expect(resolved.missing).toEqual(["motorista FULANO DESCONHECIDO", "veículo XYZ9A99"]);
  });

  it("does not block on an unknown trailer — the trip still runs with driver and vehicle", () => {
    const resolved = resolveResources(index, {
      driverName: "JOAO CARLOS",
      driverCpf: null,
      vehiclePlate: "EMU7F18",
      trailerPlate: "AAA0A00",
    });
    expect(resolved.driver?.id).toBe("d1");
    expect(resolved.trailerId).toBeUndefined();
    expect(resolved.missing).toEqual([]);
  });
});
