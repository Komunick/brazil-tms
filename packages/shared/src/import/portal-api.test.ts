import { describe, expect, it } from "vitest";
import { mapPortalApiTrips, type PortalApiEnvelope } from "./portal-api";
import { milestonesFor, parsePortalInstant } from "./portal-milestones";

/**
 * The portal's API payload → the same `PortalTrip[]` the file export produces, so the robot and the
 * upload share one downstream implementation.
 *
 * Fixtures are invented (station ids, LH numbers, an invented driver name) — the real payload carries
 * drivers' names and is never copied into the repo.
 */

// 13/08/2026 09:00 São Paulo = 12:00Z.
const NOVE_DA_MANHA = Math.floor(Date.UTC(2026, 7, 13, 12, 0, 0) / 1000);
const HORA = 3600;

function envelope(...trips: Record<string, unknown>[]): PortalApiEnvelope {
  return {
    retcode: 0,
    message: "",
    data: { pageno: 1, count: trips.length, total: trips.length, list: trips },
  };
}

function viagem(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    trip_number: "LH-TESTE-1",
    trip_name: "Viagem de teste",
    trip_status: 90,
    driver_name: "Fulano de Tal",
    vehicle_number: "ABC1D23",
    vehicle_type_name: "CARRETA",
    trip_station: [
      {
        sequence_number: 1,
        station: 910001,
        station_name: "Origem",
        station_code: "SOC-XX1",
        sta: NOVE_DA_MANHA,
        std: NOVE_DA_MANHA + HORA,
        ata: NOVE_DA_MANHA + 10 * 60,
        atd: NOVE_DA_MANHA + HORA + 5 * 60,
      },
      {
        sequence_number: 2,
        station: 910002,
        station_name: "Destino",
        station_code: "HUB-XX2",
        sta: NOVE_DA_MANHA + 6 * HORA,
        std: 0,
        ata: NOVE_DA_MANHA + 6 * HORA + 20 * 60,
        atd: 0,
      },
    ],
    ...over,
  };
}

describe("mapPortalApiTrips", () => {
  it("builds the trip, its stops and the leg between them", () => {
    const { trips, rejected } = mapPortalApiTrips(envelope(viagem()));
    expect(rejected).toHaveLength(0);
    expect(trips).toHaveLength(1);

    const trip = trips[0]!;
    expect(trip.externalTripId).toBe("LH-TESTE-1");
    expect(trip.legs).toHaveLength(1);
    expect(trip.legs[0]!.origin.stationId).toBe("910001");
    expect(trip.legs[0]!.destination.stationId).toBe("910002");
    // The station cell is rebuilt in the shape the rest of the pipeline already reads.
    expect(trip.legs[0]!.origin.stationValue).toBe("[910001]Origem");
  });

  it("carries the driver and the plate — which the file export never gave us", () => {
    const trip = mapPortalApiTrips(envelope(viagem())).trips[0]!;
    expect(trip.driverLabel).toBe("Fulano de Tal");
    expect(trip.plateLabel).toBe("ABC1D23");
    expect(trip.vehicleLabel).toBe("CARRETA");
  });

  it("reads the epoch instants as real times, and 0 as 'not yet'", () => {
    const trip = mapPortalApiTrips(envelope(viagem())).trips[0]!;
    const destino = trip.legs[0]!.destination;
    expect(parsePortalInstant(destino.plannedArrival)?.toISOString()).toBe(
      "2026-08-13T18:00:00.000Z",
    );
    // The last stop has no departure (nothing leaves it): the portal says 0, which is not a time.
    expect(parsePortalInstant(destino.actualDeparture)).toBeNull();
  });

  it("feeds the milestone machinery unchanged — same output as the file path", () => {
    const trip = mapPortalApiTrips(envelope(viagem())).trips[0]!;
    const marcos = milestonesFor(trip.legs[0]!);
    expect(marcos.map((m) => m.status)).toEqual(["at_origin", "in_transit", "at_destination"]);
    expect(marcos[0]!.at.toISOString()).toBe("2026-08-13T12:10:00.000Z");
  });

  it("names only the status codes measured against the live portal", () => {
    const label = (code: number) =>
      mapPortalApiTrips(envelope(viagem({ trip_status: code }))).trips[0]!.status;
    expect(label(4)).toBe("Planned");
    expect(label(5)).toBe("Assigned");
    expect(label(90)).toBe("Completed");
    expect(label(100)).toBe("Cancelled");
  });

  it("an unknown status can never close a trip: it passes through unnamed", () => {
    // The safety property. `Status 42` matches no `closedStatusLabels` entry, so a code nobody has
    // seen updates the plan and leaves the lifecycle alone.
    expect(mapPortalApiTrips(envelope(viagem({ trip_status: 42 }))).trips[0]!.status).toBe(
      "Status 42",
    );
  });

  it("rejects with a reason instead of inventing: no trip number, or a single stop", () => {
    const semNumero = mapPortalApiTrips(envelope(viagem({ trip_number: "  " })));
    expect(semNumero.trips).toHaveLength(0);
    expect(semNumero.rejected[0]!.reason).toContain("sem número");

    const umaParada = mapPortalApiTrips(
      envelope(
        viagem({ trip_station: [{ sequence_number: 1, station: 910001, station_name: "Só" }] }),
      ),
    );
    expect(umaParada.trips).toHaveLength(0);
    expect(umaParada.rejected[0]!.externalTripId).toBe("LH-TESTE-1");
  });

  it("orders stops by the portal's own sequence, not by array order", () => {
    const embaralhada = viagem();
    const paradas = embaralhada.trip_station as Record<string, unknown>[];
    embaralhada.trip_station = [paradas[1], paradas[0]];
    const trip = mapPortalApiTrips(envelope(embaralhada)).trips[0]!;
    expect(trip.legs[0]!.origin.stationId).toBe("910001");
  });

  it("a three-stop trip becomes two legs (the milk run the customer plans as one)", () => {
    const tresParadas = viagem();
    const paradas = tresParadas.trip_station as Record<string, unknown>[];
    tresParadas.trip_station = [
      ...paradas,
      {
        sequence_number: 3,
        station: 910003,
        station_name: "Terceiro",
        sta: NOVE_DA_MANHA + 12 * HORA,
        std: 0,
        ata: 0,
        atd: 0,
      },
    ];
    const trip = mapPortalApiTrips(envelope(tresParadas)).trips[0]!;
    expect(trip.legs.map((l) => l.legNumber)).toEqual([1, 2]);
    expect(trip.legs[1]!.origin.stationId).toBe("910002");
  });

  it("an empty or malformed payload yields nothing, without throwing", () => {
    expect(mapPortalApiTrips({}).trips).toEqual([]);
    expect(mapPortalApiTrips({ data: { list: [] } }).trips).toEqual([]);
    expect(
      mapPortalApiTrips({ data: { list: [null as unknown as object] } }).rejected,
    ).toHaveLength(1);
  });
});
