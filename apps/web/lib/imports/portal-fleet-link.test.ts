import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  alerts,
  auditLogs,
  carriers,
  customers,
  db,
  drivers,
  importBatches,
  lanes,
  linkStationIds,
  locations,
  tripAssignments,
  tripEvents,
  trips,
  vehicles,
} from "@brazil-tms/db";
import { ingestPortalFeed } from "./portal-feed";

/**
 * O vínculo automático: a palavra do cliente virando atribuição de verdade.
 *
 * O que importa aqui não é o caminho feliz, é o que ele se RECUSA a fazer — não inventar recurso e
 * não passar por cima das regras do TMS quando o cliente põe na estrada alguém que elas barram.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const HORA = 3600;
const NOVE = Math.floor(Date.UTC(2026, 7, 13, 12, 0, 0) / 1000);

describe.skipIf(!hasDb)("vínculo com a frota (integration)", () => {
  let customerId = "";
  let customerCode = "";
  const token = `FL${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const criados: string[] = [];
  const carrierIds: string[] = [];

  beforeAll(async () => {
    customerCode = `FLEET-${token}`;
    customerId = (
      await db
        .insert(customers)
        .values({ name: `Cliente frota ${token}`, customerCode })
        .returning({ id: customers.id })
    )[0]!.id;
    await db.insert(locations).values([
      { customerId, code: `FLO-${token}`, name: "Origem" },
      { customerId, code: `FLD-${token}`, name: "Destino" },
    ]);
    await linkStationIds(customerId, [
      { stationId: "920001", code: `FLO-${token}` },
      { stationId: "920002", code: `FLD-${token}` },
    ]);
    process.env.PORTAL_FEED_ACTOR_EMAIL = "admin@braziltransports.com.br";

    // Um motorista e um veículo em ordem, um com CNH vencida (aceita com aviso desde 2026-08-19)
    // e um INATIVO, que é o bloqueio duro que sobrou.
    const d1 = await db
      .insert(drivers)
      .values({
        name: `MOTORISTA BOM ${token}`,
        ownershipType: "owned",
        status: "active",
        licenseExpiry: "2030-01-01",
      })
      .returning({ id: drivers.id });
    const d2 = await db
      .insert(drivers)
      .values({
        name: `MOTORISTA VENCIDO ${token}`,
        ownershipType: "owned",
        status: "active",
        licenseExpiry: "2020-01-01",
      })
      .returning({ id: drivers.id });

    const v1 = await db
      .insert(vehicles)
      .values({
        plate: `AAA${Math.floor(Math.random() * 9000 + 1000)}`,
        vehicleType: "carreta",
        ownershipType: "owned",
        status: "active",
        documentExpiry: "2030-01-01",
      })
      .returning({ id: vehicles.id, plate: vehicles.plate });
    // Ativo, mas com o documento vencido: é encontrado pela busca e barrado pelo avaliador.
    const v2 = await db
      .insert(vehicles)
      .values({
        plate: `BBB${Math.floor(Math.random() * 9000 + 1000)}`,
        vehicleType: "carreta",
        ownershipType: "owned",
        status: "active",
        documentExpiry: "2020-01-01",
      })
      .returning({ id: vehicles.id, plate: vehicles.plate });
    criados.push(d1[0]!.id, d2[0]!.id, v1[0]!.id, v2[0]!.id);
    placaBoa = v1[0]!.plate;
    placaVencida = v2[0]!.plate;
  });

  let placaBoa = "";
  let placaVencida = "";

  afterAll(async () => {
    const ids = (
      await db.select({ id: trips.id }).from(trips).where(eq(trips.customerId, customerId))
    ).map((t) => t.id);
    if (ids.length) {
      // Uma viagem que anda com a janela vencida gera aviso, e o aviso segura a viagem por FK.
      await db.delete(alerts).where(inArray(alerts.tripId, ids));
      await db.delete(tripAssignments).where(inArray(tripAssignments.tripId, ids));
      await db.delete(tripEvents).where(inArray(tripEvents.tripId, ids));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, ids));
      await db.delete(trips).where(inArray(trips.id, ids));
    }
    // O vínculo conta como mudança, então o feed passou a registrar lote no histórico deste cliente.
    await db.delete(importBatches).where(eq(importBatches.customerId, customerId));
    await db.delete(lanes).where(eq(lanes.customerId, customerId));
    await db.delete(locations).where(eq(locations.customerId, customerId));
    await db.delete(auditLogs).where(eq(auditLogs.entityId, customerId));
    await db.delete(customers).where(eq(customers.id, customerId));
    await db.delete(drivers).where(inArray(drivers.id, criados));
    await db.delete(vehicles).where(inArray(vehicles.id, criados));
    if (carrierIds.length) await db.delete(carriers).where(inArray(carriers.id, carrierIds));
  });

  function payload(over: Record<string, unknown>) {
    return {
      retcode: 0,
      data: {
        total: 1,
        list: [
          {
            trip_status: 5,
            vehicle_type_name: "CARRETA",
            trip_station: [
              {
                sequence_number: 1,
                station: 920001,
                station_name: "Origem",
                sta: NOVE,
                std: NOVE + HORA,
                ata: 0,
                atd: 0,
              },
              {
                sequence_number: 2,
                station: 920002,
                station_name: "Destino",
                sta: NOVE + 7 * HORA,
                std: 0,
                ata: 0,
                atd: 0,
              },
            ],
            ...over,
          },
        ],
      },
    };
  }

  it("vincula quando o nome e a placa batem com o cadastro", async () => {
    const ext = `LH-OK-${token}`;
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        driver_name: `Motorista Bom ${token}`,
        vehicle_number: placaBoa.toLowerCase(),
      }),
      mode: "plan",
      customerCode,
    });
    expect(r.planSummary?.linked).toBe(1);

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    expect(trip.currentStatus).toBe("assigned");
    const atrib = await db
      .select()
      .from(tripAssignments)
      .where(eq(tripAssignments.tripId, trip.id));
    expect(atrib).toHaveLength(1);
    expect(atrib[0]!.isCurrent).toBe(true);
  });

  it("vincula recurso SUBCONTRATADO usando a transportadora do próprio cadastro", async () => {
    // 883 dos 982 motoristas desta frota são subcontratados, e o TMS exige transportadora nesse
    // caso. Ela não é decisão nova: já está no recurso. Sem isso, a primeira rodada real bloqueou
    // 48 e vinculou zero.
    const transportadora = (
      await db
        .insert(carriers)
        .values({
          name: `Transportadora ${token}`,
          taxId: String(Date.now()).slice(0, 14),
          documentationStatus: "complete",
        })
        .returning({ id: carriers.id })
    )[0]!;
    const d = (
      await db
        .insert(drivers)
        .values({
          name: `MOTORISTA TERCEIRO ${token}`,
          ownershipType: "subcontracted",
          carrierId: transportadora.id,
          status: "active",
          licenseExpiry: "2030-01-01",
        })
        .returning({ id: drivers.id })
    )[0]!;
    const v = (
      await db
        .insert(vehicles)
        .values({
          plate: `BBB${Math.floor(Math.random() * 9000 + 1000)}`,
          vehicleType: "carreta",
          ownershipType: "subcontracted",
          carrierId: transportadora.id,
          status: "active",
          documentExpiry: "2030-01-01",
        })
        .returning({ id: vehicles.id, plate: vehicles.plate })
    )[0]!;
    criados.push(d.id, v.id);
    carrierIds.push(transportadora.id);

    const ext = `LH-TERC-${token}`;
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        driver_name: `Motorista Terceiro ${token}`,
        vehicle_number: v.plate,
      }),
      mode: "plan",
      customerCode,
    });
    // Objeto inteiro na asserção: se falhar, a mensagem já diz POR QUE não vinculou.
    expect({
      linked: r.planSummary?.linked,
      bloqueadas: r.planSummary?.linkBlockedReasons,
      semCadastro: r.planSummary?.linkNoMatch,
    }).toEqual({ linked: 1, bloqueadas: [], semCadastro: 0 });

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    const atrib = (
      await db.select().from(tripAssignments).where(eq(tripAssignments.tripId, trip.id))
    )[0]!;
    expect(atrib.carrierId).toBe(transportadora.id);
  });

  it("transportadoras diferentes: vale a do motorista, e a divergência fica escrita", async () => {
    // Isto recusava o vínculo, e recusava 40 das 57 viagens vivas — porque a frota entrou por
    // planilha em dois baldes (motoristas numa transportadora, veículos noutra), não porque alguém
    // tenha juntado gente de uma com caminhão de outra. Vale a do motorista, e a atribuição diz que
    // o veículo está sob outra: quem confere pagamento de subcontratado encontra o motivo.
    const [doMotorista, doVeiculo] = await Promise.all([
      db
        .insert(carriers)
        .values({
          name: `Transp Motorista ${token}`,
          taxId: String(Date.now() + 1).slice(0, 14),
          documentationStatus: "complete",
        })
        .returning({ id: carriers.id }),
      db
        .insert(carriers)
        .values({
          name: `Transp Veiculo ${token}`,
          taxId: String(Date.now() + 2).slice(0, 14),
          documentationStatus: "complete",
        })
        .returning({ id: carriers.id }),
    ]);
    const carrierMotorista = doMotorista[0]!.id;
    const carrierVeiculo = doVeiculo[0]!.id;

    const d = (
      await db
        .insert(drivers)
        .values({
          name: `MOTORISTA DIVERGE ${token}`,
          ownershipType: "subcontracted",
          carrierId: carrierMotorista,
          status: "active",
          licenseExpiry: "2030-01-01",
        })
        .returning({ id: drivers.id })
    )[0]!;
    const v = (
      await db
        .insert(vehicles)
        .values({
          plate: `DDD${Math.floor(Math.random() * 9000 + 1000)}`,
          vehicleType: "carreta",
          ownershipType: "subcontracted",
          carrierId: carrierVeiculo,
          status: "active",
          documentExpiry: "2030-01-01",
        })
        .returning({ id: vehicles.id, plate: vehicles.plate })
    )[0]!;
    criados.push(d.id, v.id);
    carrierIds.push(carrierMotorista, carrierVeiculo);

    const ext = `LH-DIVERGE-${token}`;
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        driver_name: `Motorista Diverge ${token}`,
        vehicle_number: v.plate,
      }),
      mode: "plan",
      customerCode,
    });
    expect({
      linked: r.planSummary?.linked,
      bloqueadas: r.planSummary?.linkBlockedReasons,
    }).toEqual({ linked: 1, bloqueadas: [] });

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    const atrib = (
      await db.select().from(tripAssignments).where(eq(tripAssignments.tripId, trip.id))
    )[0]!;
    expect(atrib.carrierId).toBe(carrierMotorista);
    expect(atrib.notes).toMatch(/veículo está cadastrado sob outra/i);
  });

  it("vincula com AVISO quando falta a data do documento, e grava o motivo", async () => {
    // O caso real: 901 dos 902 veículos não têm validade de documento cadastrada. Isso é aviso, não
    // impedimento — e exigir uma pessoa por viagem faria ninguém ser atribuído nunca. Vincula, e o
    // motivo fica gravado na atribuição, auditável.
    const v = (
      await db
        .insert(vehicles)
        .values({
          plate: `CCC${Math.floor(Math.random() * 9000 + 1000)}`,
          vehicleType: "carreta",
          ownershipType: "owned",
          status: "active",
          // sem documentExpiry — é o que dispara o aviso
        })
        .returning({ id: vehicles.id, plate: vehicles.plate })
    )[0]!;
    // Motorista PRÓPRIO deste caso: reusar o do primeiro teste, na mesma janela, dispararia
    // conflito de agenda — que é bloqueio por decisão, e mascararia o que se quer verificar aqui.
    const d = (
      await db
        .insert(drivers)
        .values({
          name: `MOTORISTA DOIS ${token}`,
          ownershipType: "owned",
          status: "active",
          licenseExpiry: "2030-01-01",
        })
        .returning({ id: drivers.id })
    )[0]!;
    criados.push(v.id, d.id);

    const ext = `LH-AVISO-${token}`;
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        driver_name: `Motorista Dois ${token}`,
        vehicle_number: v.plate,
      }),
      mode: "plan",
      customerCode,
    });
    expect(r.planSummary?.linked).toBe(1);
    expect(r.planSummary?.linkedWithWarnings).toBe(1);

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    expect(trip.currentStatus).toBe("assigned");
    const atrib = (
      await db.select().from(tripAssignments).where(eq(tripAssignments.tripId, trip.id))
    )[0]!;
    // O motivo diz que é espelho do cliente E quais avisos foram aceitos — nada passa calado.
    expect(atrib.overrideReason).toMatch(/espelho.*portal/i);
    expect(atrib.overrideReason).toMatch(/doc_missing/);
  });

  it("viagem que chega JÁ EM CURSO registra o motorista sem mexer no status", async () => {
    // A viagem só aparece no portal depois de aceita: quando o robô a vê, o caminhão já saiu. Isto
    // recusava o vínculo por não estar em "Recebida", e o motorista ficava visível no card do portal
    // com o painel de Atribuições vazio — que foi o que o usuário encontrou em LT1Q8G02ECV41.
    const d = (
      await db
        .insert(drivers)
        .values({
          name: `MOTORISTA EM CURSO ${token}`,
          ownershipType: "owned",
          status: "active",
          licenseExpiry: "2030-01-01",
        })
        .returning({ id: drivers.id })
    )[0]!;
    const v = (
      await db
        .insert(vehicles)
        .values({
          plate: `EEE${Math.floor(Math.random() * 9000 + 1000)}`,
          vehicleType: "carreta",
          ownershipType: "owned",
          status: "active",
          documentExpiry: "2030-01-01",
        })
        .returning({ id: vehicles.id, plate: vehicles.plate })
    )[0]!;
    criados.push(d.id, v.id);

    // Dois ciclos, que é como acontece de verdade: no primeiro a viagem já vem andando e SEM
    // motorista (o portal ainda não o publicou), e os horários reais a levam até "em trânsito".
    const ext = `LH-CURSO-${token}`;
    const andando = [
      {
        sequence_number: 1,
        station: 920001,
        station_name: "Origem",
        sta: NOVE,
        std: NOVE + HORA,
        ata: NOVE,
        atd: NOVE + HORA,
      },
      {
        sequence_number: 2,
        station: 920002,
        station_name: "Destino",
        sta: NOVE + 7 * HORA,
        std: 0,
        ata: 0,
        atd: 0,
      },
    ];
    const primeiro = await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        driver_name: null,
        vehicle_number: null,
        trip_station: andando,
      }),
      mode: "plan",
      customerCode,
    });
    expect({ vinculadas: primeiro.planSummary?.linked }).toEqual({ vinculadas: 0 });

    // No segundo o portal já diz quem está dirigindo — e a viagem passou de "Recebida" há muito.
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        driver_name: `Motorista Em Curso ${token}`,
        vehicle_number: v.plate,
        trip_station: andando,
      }),
      mode: "plan",
      customerCode,
    });
    expect({
      vinculadas: r.planSummary?.linked,
      bloqueadas: r.planSummary?.linkBlockedReasons,
    }).toEqual({ vinculadas: 1, bloqueadas: [] });

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    // O status é o que a operação diz, não o que a atribuição gostaria: nada foi rebobinado.
    expect(trip.currentStatus).toBe("in_transit");

    const atrib = (
      await db.select().from(tripAssignments).where(eq(tripAssignments.tripId, trip.id))
    )[0]!;
    expect(atrib.isCurrent).toBe(true);
    expect(atrib.driverId).toBe(d.id);
    // A nota diz que o registro é retroativo — ninguém confunde isto com um despacho feito a tempo.
    expect(atrib.notes).toMatch(/já em curso/i);
    // E já nasce confirmada: o caminhão está na estrada. Sem isto, o aviso de "confirmação
    // pendente" ficava aceso numa viagem carregando, sem jeito de apagar.
    expect(atrib.confirmedAt).not.toBeNull();
  });

  it("casa o motorista mesmo quando o acento difere entre os dois sistemas", async () => {
    // Dois sistemas, duas pessoas digitando o mesmo nome. Medido na base: 3 dos 15 "motoristas sem
    // cadastro" estavam cadastrados o tempo todo, e só o Ô os separava.
    const d = (
      await db
        .insert(drivers)
        .values({
          name: `MARCOS ANTÔNIO ${token}`,
          ownershipType: "owned",
          status: "active",
          licenseExpiry: "2030-01-01",
        })
        .returning({ id: drivers.id })
    )[0]!;
    const v = (
      await db
        .insert(vehicles)
        .values({
          plate: `FFF${Math.floor(Math.random() * 9000 + 1000)}`,
          vehicleType: "carreta",
          ownershipType: "owned",
          status: "active",
          documentExpiry: "2030-01-01",
        })
        .returning({ id: vehicles.id, plate: vehicles.plate })
    )[0]!;
    criados.push(d.id, v.id);

    const ext = `LH-ACENTO-${token}`;
    const r = await ingestPortalFeed({
      // O portal manda SEM acento e com espaço a mais — as duas coisas que se via na prática.
      payload: payload({
        trip_number: ext,
        driver_name: `MARCOS  ANTONIO ${token}`,
        vehicle_number: v.plate,
      }),
      mode: "plan",
      customerCode,
    });
    expect({ vinculadas: r.planSummary?.linked, semCadastro: r.planSummary?.linkNoMatch }).toEqual({
      vinculadas: 1,
      semCadastro: 0,
    });

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    const atrib = (
      await db.select().from(tripAssignments).where(eq(tripAssignments.tripId, trip.id))
    )[0]!;
    expect(atrib.driverId).toBe(d.id);
  });

  it("NÃO casa dois motoristas diferentes só porque parecem: o nome inteiro continua exigido", async () => {
    // O dobramento tira acento e espaço sobrando. Não tira sobrenome, não faz aproximação.
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: `LH-QUASE-${token}`,
        driver_name: `Motorista Bo ${token}`, // falta o "m" de "Bom"
        vehicle_number: placaBoa,
      }),
      mode: "plan",
      customerCode,
    });
    expect({ vinculadas: r.planSummary?.linked, semCadastro: r.planSummary?.linkNoMatch }).toEqual({
      vinculadas: 0,
      semCadastro: 1,
    });
  });

  it("viagem sem motorista designado no portal não conta como pendência de cadastro", async () => {
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: `LH-VAZIO-${token}`,
        driver_name: null,
        vehicle_number: null,
      }),
      mode: "plan",
      customerCode,
    });
    expect(r.planSummary?.linkNotStated).toBe(1);
    expect(r.planSummary?.linkNoMatch).toBe(0);
  });

  it("não inventa recurso: nome que a frota não tem é reportado", async () => {
    const ext = `LH-SEM-${token}`;
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        driver_name: "Quem Nao Existe",
        vehicle_number: "ZZZ0A00",
      }),
      mode: "plan",
      customerCode,
    });
    expect(r.planSummary?.linkNoMatch).toBe(1);
    expect(r.planSummary?.linked).toBe(0);

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    expect(trip.currentStatus).toBe("received");
  });

  it("RECUSA a escolha do cliente quando as regras do TMS barram, e diz por quê", async () => {
    // O ponto do vínculo: o cliente pôs na estrada um veículo com o documento vencido. O TMS não
    // passa por cima disso em silêncio — reporta, e a viagem fica sem atribuição para alguém
    // resolver. (Motorista com CNH vencida NÃO cai mais aqui: ver o teste seguinte.)
    const ext = `LH-BLOQ-${token}`;
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        driver_name: `Motorista Bom ${token}`,
        vehicle_number: placaVencida,
      }),
      mode: "plan",
      customerCode,
    });
    expect(r.planSummary?.linkBlocked).toBe(1);
    expect(r.planSummary?.linkBlockedReasons.join(" ")).toMatch(/bloqueada|exceção/i);

    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    expect(trip.currentStatus).toBe("received");
  });

  /**
   * A EXCEÇÃO DA CNH, decidida em 2026-08-19 (commit b7bc82f) e sem teste até aqui.
   *
   * Este arquivo afirmava o contrário — CNH vencida bloqueava — e ficou vermelho desde a mudança de
   * regra, invisível porque as suítes com banco PULAM sem `DATABASE_URL`, que é o caso da CI.
   *
   * A regra em vigor: recusar não impedia a viagem de acontecer, só escondia quem estava dirigindo.
   * Então o espelho do portal aceita, registra e avisa. Vale SÓ para o espelho: a atribuição feita à
   * mão continua barrada, porque lá existe uma pessoa que pode corrigir o cadastro.
   */
  it("ACEITA CNH vencida e avisa, em vez de esconder quem dirigiu", async () => {
    const ext = `LH-CNH-${token}`;
    const r = await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        driver_name: `Motorista Vencido ${token}`,
        vehicle_number: placaBoa,
      }),
      mode: "plan",
      customerCode,
    });
    expect(r.planSummary?.linkBlocked).toBe(0);
    expect(r.planSummary?.linkedWithWarnings).toBe(1);

    // O que a decisão queria: o motorista aparece na viagem, não some dela.
    const trip = (await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1))[0]!;
    const atribuicao = (
      await db
        .select({ driverId: tripAssignments.driverId })
        .from(tripAssignments)
        .where(eq(tripAssignments.tripId, trip.id))
        .limit(1)
    )[0];
    expect(atribuicao?.driverId).toBeTruthy();
  });

  it("viagem JÁ CONCLUÍDA ainda registra quem a dirigiu", async () => {
    /**
     * Medido em 2026-08-18: 121 viagens concluídas e 258 em faturamento tinham motorista e placa no
     * card do portal e nenhuma atribuição no TMS. A regra dizia "encerrada não recebe mais nada", e
     * isso confundia duas coisas — não MOVER uma viagem fechada está certo; não REGISTRAR quem a
     * dirigiu apaga a história de quem rodou.
     *
     * A porta fechava e não abria mais: o portal continua mandando a linha em todo ciclo, e todo
     * ciclo ela batia no mesmo `continue`. Só se via abrindo o portal viagem por viagem.
     */
    const d = (
      await db
        .insert(drivers)
        .values({
          name: `MOTORISTA CONCLUIDA ${token}`,
          ownershipType: "owned",
          status: "active",
          licenseExpiry: "2030-01-01",
        })
        .returning({ id: drivers.id })
    )[0]!;
    const v = (
      await db
        .insert(vehicles)
        .values({
          plate: `GGG${Math.floor(Math.random() * 9000 + 1000)}`,
          vehicleType: "carreta",
          ownershipType: "owned",
          status: "active",
          documentExpiry: "2030-01-01",
        })
        .returning({ id: vehicles.id, plate: vehicles.plate })
    )[0]!;
    criados.push(d.id, v.id);

    // Uma viagem que rodou do começo ao fim, e que o portal ainda não tinha creditado a ninguém.
    const rodou = [
      {
        sequence_number: 1,
        station: 920001,
        station_name: "Origem",
        sta: NOVE,
        std: NOVE + HORA,
        ata: NOVE,
        atd: NOVE + HORA,
      },
      {
        sequence_number: 2,
        station: 920002,
        station_name: "Destino",
        sta: NOVE + 7 * HORA,
        std: 0,
        ata: NOVE + 7 * HORA,
        atd: 0,
        unseal_time: NOVE + 8 * HORA,
        unload_time: NOVE + 8 * HORA + 1800,
      },
    ];
    const ext = `LH-FIM-${token}`;
    await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        trip_status: 90,
        driver_name: null,
        vehicle_number: null,
        trip_station: rodou,
      }),
      mode: "history",
      customerCode,
    });

    const fechada = (
      await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1)
    )[0]!;
    expect(fechada.currentStatus).toBe("completed");
    expect(
      (await db.select().from(tripAssignments).where(eq(tripAssignments.tripId, fechada.id)))
        .length,
    ).toBe(0);

    // O ciclo seguinte traz o motorista. A viagem está fechada — e é exatamente aí que a regra
    // antiga desistia.
    await ingestPortalFeed({
      payload: payload({
        trip_number: ext,
        trip_status: 90,
        driver_name: `Motorista Concluida ${token}`,
        vehicle_number: v.plate,
        trip_station: rodou,
      }),
      mode: "history",
      customerCode,
    });

    const depois = (
      await db.select().from(trips).where(eq(trips.externalTripId, ext)).limit(1)
    )[0]!;
    // Registrar quem dirigiu NÃO reabre a viagem.
    expect(depois.currentStatus).toBe("completed");

    const atrib = (
      await db.select().from(tripAssignments).where(eq(tripAssignments.tripId, depois.id))
    )[0]!;
    expect(atrib.driverId).toBe(d.id);
    expect(atrib.isCurrent).toBe(true);
  });
});
