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
    // Os onze foram lidos do filtro "Status da viagem" de cada aba, pelo parâmetro que o portal
    // manda (`trip_station_status`) — nenhum é palpite. A escala é o ciclo de vida DENTRO da parada,
    // e é por isso que ela cresce: carrega, lacra, parte, chega, abre o lacre, descarrega.
    const label = (code: number) =>
      mapPortalApiTrips(envelope(viagem({ trip_status: code }))).trips[0]!.status;
    expect({
      4: label(4),
      5: label(5),
      10: label(10),
      30: label(30),
      40: label(40),
      50: label(50),
      60: label(60),
      70: label(70),
      80: label(80),
      90: label(90),
      100: label(100),
    }).toEqual({
      4: "Assigning",
      5: "Assigned",
      10: "Loading",
      30: "Seal",
      40: "Departed",
      50: "Arrived",
      60: "Unseal",
      70: "Operating",
      80: "Unloaded",
      90: "Completed",
      100: "Cancelled",
    });
  });

  it("o 20 NÃO entra por palpite: o portal não o oferece como filtro, então não foi medido", () => {
    // A viagem passa por "Em fila"/"Acoplado" antes de carregar, e o código disso existe. Mas ele
    // não aparece no filtro, então não foi possível medi-lo — e um rótulo inventado aqui viraria
    // decisão de negócio lá na frente.
    expect(mapPortalApiTrips(envelope(viagem({ trip_status: 20 }))).trips[0]!.status).toBe(
      "Status 20",
    );
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

  it("guarda o id do motorista no sistema do cliente — a única chave que os dois lados têm", () => {
    // O portal manda `driver: 181446` junto do nome, e a gente jogava fora, casando a frota por
    // NOME. Nome é frágil: um acento fora do lugar já custou 3 motoristas que existiam e o TMS
    // jurava não existirem.
    const t = mapPortalApiTrips(envelope(viagem({ driver: 181446, driver_name: "FELIPE MAIA" })))
      .trips[0]!;
    expect({ id: t.driverExternalId, nome: t.driverLabel }).toEqual({
      id: "181446",
      nome: "FELIPE MAIA",
    });
  });

  it("sem id do motorista não inventa zero: viagem sem motorista designado fica nula", () => {
    const t = mapPortalApiTrips(envelope(viagem({ driver: 0, driver_name: "" }))).trips[0]!;
    expect({ id: t.driverExternalId, nome: t.driverLabel }).toEqual({ id: null, nome: null });
  });

  /**
   * O SEGUNDO MOTORISTA vinha na mesma listagem e era descartado (2026-09-04, a pedido).
   *
   * A linha da programação mostrava um motorista só. Numa viagem de dois isso é meia informação:
   * quem escala não tem como saber se a dupla está fechada ou se ainda falta gente — e a resposta
   * estava chegando em todo ciclo do robô, sendo jogada fora no mapeador.
   */
  it("guarda o SEGUNDO motorista, nome e id", () => {
    const t = mapPortalApiTrips(
      envelope(
        viagem({
          driver: 181446,
          driver_name: "FELIPE MAIA",
          second_driver_id: 2848730,
          second_driver_name: "EMIVALDO PEREIRA NETO",
        }),
      ),
    ).trips[0]!;
    expect({ id: t.secondDriverExternalId, nome: t.secondDriverLabel }).toEqual({
      id: "2848730",
      nome: "EMIVALDO PEREIRA NETO",
    });
  });

  /**
   * A viagem de UM motorista é a esmagadora maioria, e nela o segundo tem de ficar NULO — não zero,
   * não string vazia. A tela decide desenhar a segunda linha pela existência dele, e um zero faria
   * toda viagem comum ganhar um "2º" apontando para ninguém.
   */
  it("viagem de um motorista só deixa o segundo NULO", () => {
    const t = mapPortalApiTrips(
      envelope(viagem({ driver: 181446, driver_name: "FELIPE MAIA", second_driver_id: 0 })),
    ).trips[0]!;
    expect({ id: t.secondDriverExternalId, nome: t.secondDriverLabel }).toEqual({
      id: null,
      nome: null,
    });
  });
  it("lê a ACEITAÇÃO como eixo próprio — e o zero é um valor, não ausência", () => {
    /**
     * Medido no portal: Pending + Assigning = 44 (alguém precisa aceitar), Accepted + Assigning =
     * 359 (aceitas, esperando motorista). Sem este campo as duas filas eram uma pilha só de
     * "Recebida" no TMS, e a de 359 — a que precisa de despacho — era invisível.
     *
     * O 0 é PENDING. Tratá-lo como ausente esconderia exatamente a fila que exige decisão.
     */
    const aceite = (code: unknown) =>
      mapPortalApiTrips(envelope(viagem({ acceptance_status: code }))).trips[0]!.acceptanceStatus;
    expect({ zero: aceite(0), um: aceite(1), ausente: aceite(undefined) }).toEqual({
      zero: "Pending",
      um: "Accepted",
      ausente: null,
    });
  });

  it("um código de aceitação desconhecido não vira rótulo inventado", () => {
    // "Accepted(Pending Award)" existe no portal e hoje não tem viagem nenhuma, então o código dele
    // não foi medido. Fica visível como número em vez de virar um palpite com cara de verdade.
    expect(
      mapPortalApiTrips(envelope(viagem({ acceptance_status: 2 }))).trips[0]!.acceptanceStatus,
    ).toBe("Aceitação 2");
  });
});

describe("de quem é a viagem (agency_id)", () => {
  it("lê a transportadora e distingue a proposta em aberto de quem não informa", () => {
    const { trips } = mapPortalApiTrips(
      envelope(
        viagem({ trip_number: "LH-NOSSA", agency_id: 1450, agency_name: "BRAZIL TRANSPORTS" }),
        viagem({ trip_number: "LH-ABERTA", agency_id: 0, agency_name: "" }),
        viagem({ trip_number: "LH-SEM-CAMPO" }),
      ),
    );
    const de = (id: string) => trips.find((t) => t.externalTripId === id)!;
    expect(de("LH-NOSSA").agencyId).toBe(1450);
    expect(de("LH-NOSSA").agencyName).toBe("BRAZIL TRANSPORTS");
    // Zero é a proposta que a Shopee ainda não deu a ninguém — e é o que o feed recusa.
    expect(de("LH-ABERTA").agencyId).toBe(0);
    expect(de("LH-ABERTA").agencyName).toBeNull();
    // Sem o campo é "não sei", e não sei nunca vira acusação: fica nulo, e o feed deixa passar.
    expect(de("LH-SEM-CAMPO").agencyId).toBeNull();
  });
});

/**
 * A DOCA DE SAÍDA (30/08), com a forma medida no portal ao vivo naquele dia.
 *
 * Os valores aqui não são inventados: `outbound_dock_infos` com um objeto, `dock_name` dentro,
 * `schedule_outbound_dock_info` zerado ao lado. Foram 39 viagens do Aceito e 0 do Planejado — a
 * doca nasce quando a estação encosta o veículo, não no planejamento.
 */
describe("a doca de saída", () => {
  const viagem = (paradas: Record<string, unknown>[]) => ({
    retcode: 0,
    data: { list: [{ trip_number: "LT0Q8R02ETKV1", trip_station: paradas }] },
  });
  const parada = (seq: number, nome: string, extra: Record<string, unknown> = {}) => ({
    sequence_number: seq,
    station: 8300 + seq,
    station_name: nome,
    ...extra,
  });

  it("lê o nome da doca da parada de origem", () => {
    const r = mapPortalApiTrips(
      viagem([
        parada(1, "SoC_CE_Itaitinga", {
          loading_time: 1787879721,
          outbound_dock_infos: [{ dock_id: 2074, dock_name: "Doca Outbound LH 01" }],
        }),
        parada(2, "LM Hub_CE_Fortaleza"),
      ]),
    );
    expect(r.trips[0]?.legs[0]?.origin.docaSaida).toBe("Doca Outbound LH 01");
  });

  /**
   * MEDIDO: `" EXTERNA66"` e `" EXTERNA62"` chegam com espaço na frente. Os nomes são digitados na
   * estação, e sem o corte o selo da tela mostraria um recuo que parece defeito de alinhamento.
   */
  it("corta o espaço que vem digitado na estação", () => {
    const r = mapPortalApiTrips(
      viagem([
        parada(1, "A", { outbound_dock_infos: [{ dock_name: " EXTERNA66" }] }),
        parada(2, "B"),
      ]),
    );
    expect(r.trips[0]?.legs[0]?.origin.docaSaida).toBe("EXTERNA66");
  });

  it("o espaço do MEIO fica — é o nome de verdade", () => {
    // `"EXTERNA 32"` existe assim no portal, ao lado de `"EXTERNA31"` sem espaço. Normalizar isso
    // seria inventar um nome que a portaria não usa.
    const r = mapPortalApiTrips(
      viagem([
        parada(1, "A", { outbound_dock_infos: [{ dock_name: "EXTERNA 32" }] }),
        parada(2, "B"),
      ]),
    );
    expect(r.trips[0]?.legs[0]?.origin.docaSaida).toBe("EXTERNA 32");
  });

  it("sem doca é null, e não string vazia — a viagem ainda não carregou", () => {
    // 11 das 50 do Aceito, e 50 das 50 do Planejado. Não é falha de leitura: é o estado normal
    // antes de a estação encostar o veículo, e a tela precisa poder calar em vez de mostrar vazio.
    const r = mapPortalApiTrips(
      viagem([parada(1, "A", { outbound_dock_infos: [] }), parada(2, "B")]),
    );
    expect(r.trips[0]?.legs[0]?.origin.docaSaida).toBeNull();
  });

  it("ignora a doca PLANEJADA, que vem zerada", () => {
    // `schedule_outbound_dock_info` veio com `dock_name: ""` em todas as 50. Ler esse campo daria
    // uma doca vazia em toda viagem — um selo permanente que não diz nada.
    const r = mapPortalApiTrips(
      viagem([
        parada(1, "A", {
          schedule_outbound_dock_info: { dock_id: 0, dock_name: "" },
          outbound_dock_infos: [],
        }),
        parada(2, "B"),
      ]),
    );
    expect(r.trips[0]?.legs[0]?.origin.docaSaida).toBeNull();
  });

  it("com mais de uma doca, fica a primeira COM NOME", () => {
    // Nunca houve duas nas 39 medidas. Se vier, uma é melhor que duas concatenadas numa string que
    // ninguém sabe ler — e uma entrada sem nome não pode ganhar da que tem.
    const r = mapPortalApiTrips(
      viagem([
        parada(1, "A", {
          outbound_dock_infos: [{ dock_name: "" }, { dock_name: "EXTERNA79" }, { dock_name: "X1" }],
        }),
        parada(2, "B"),
      ]),
    );
    expect(r.trips[0]?.legs[0]?.origin.docaSaida).toBe("EXTERNA79");
  });
});
