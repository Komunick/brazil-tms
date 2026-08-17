import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, count, eq, inArray, lt } from "drizzle-orm";
import { ACTIVE_TRIP_STATUSES, dayRangeSaoPaulo, type TripStatus } from "@brazil-tms/shared";
import { alerts, auditLogs, customers, db, locations, tripEvents, trips } from "@brazil-tms/db";
import { queryWallboard } from "./wallboard-read";

/**
 * O painel da parede.
 *
 * O que precisa estar certo aqui não é o desenho, é a ESCOLHA: numa lista que o servidor corta, a
 * ordem decide o que a sala vê e o que some. E os contadores do rodapé decidem se o vermelho da
 * parede quer dizer alguma coisa.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("queryWallboard (integration)", () => {
  let customerId = "";
  let originId = "";
  let destId = "";
  const tripIds: string[] = [];
  const code = (p: string): string => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const HORA = 3600_000;

  async function makeTrip(over: {
    status: TripStatus;
    entregaEmHoras?: number;
    coletaEmHoras?: number;
    sla?: string;
    externo?: string;
  }): Promise<string> {
    const agora = Date.now();
    const inserted = await db
      .insert(trips)
      .values({
        customerId,
        externalTripId: over.externo ?? code("LH"),
        originLocationId: originId,
        destinationLocationId: destId,
        originalPlan: {},
        currentStatus: over.status,
        plannedPickupWindowStart: new Date(agora + (over.coletaEmHoras ?? -4) * HORA),
        plannedDeliveryWindowEnd: new Date(agora + (over.entregaEmHoras ?? 6) * HORA),
        ...(over.sla ? { slaStatus: over.sla as "late" } : {}),
      })
      .returning({ id: trips.id });
    const id = inserted[0]!.id;
    tripIds.push(id);
    return id;
  }

  beforeAll(async () => {
    const cust = await db
      .insert(customers)
      .values({ name: "Cliente painel", customerCode: code("CUST") })
      .returning({ id: customers.id });
    customerId = cust[0]!.id;
    originId = (
      await db
        .insert(locations)
        .values({ customerId, code: code("ORIG"), name: "Origem Painel" })
        .returning({ id: locations.id })
    )[0]!.id;
    destId = (
      await db
        .insert(locations)
        .values({ customerId, code: code("DEST"), name: "Destino Painel" })
        .returning({ id: locations.id })
    )[0]!.id;
  });

  afterAll(async () => {
    if (tripIds.length) {
      await db.delete(alerts).where(inArray(alerts.tripId, tripIds));
      await db.delete(tripEvents).where(inArray(tripEvents.tripId, tripIds));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, tripIds));
      await db.delete(trips).where(inArray(trips.id, tripIds));
    }
    if (originId) await db.delete(locations).where(eq(locations.id, originId));
    if (destId) await db.delete(locations).where(eq(locations.id, destId));
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  });

  it("põe a ATRASADA na frente, mesmo que ela entregue mais tarde", async () => {
    // Numa lista cortada em 12, a ordem é a única coisa que importa: o que sai da tela tem de ser o
    // menos urgente. Se a ordenação fosse só por horário, a atrasada de amanhã cairia atrás.
    const cedo = code("CEDO");
    const atrasada = code("ATRASADA");
    await makeTrip({ status: "in_transit", entregaEmHoras: 2, externo: cedo });
    await makeTrip({ status: "in_transit", entregaEmHoras: 20, sla: "late", externo: atrasada });

    const board = await queryWallboard();
    const nossas = board.trips.filter((t) => [cedo, atrasada].includes(t.externalTripId ?? ""));
    expect(nossas.map((t) => t.externalTripId)).toEqual([atrasada, cedo]);
  });

  it("etapa sem viagem continua na tela, com zero — coluna que some faz o olho procurar", async () => {
    const board = await queryWallboard();
    expect(board.onTheRoad.map((e) => e.status)).toEqual([
      "at_origin",
      "loading",
      "loaded",
      "in_transit",
      "at_destination",
      "unloading",
      "unloaded",
    ]);
    expect(board.onTheRoad.every((e) => typeof e.count === "number")).toBe(true);
  });

  it("o rodapé conta só o que dá para resolver hoje — 782 contra 117 é a diferença", async () => {
    /**
     * Um número vermelho enorme que ninguém pode resolver hoje ensina a sala a ignorar o vermelho.
     * Sem o recorte, "sem motorista" dava 782 na base real contra 117 — o resto era viagem da semana
     * que vem que o cliente ainda nem designou.
     *
     * A asserção NÃO é sobre a variação do contador: o banco é compartilhado e outras suítes criam e
     * apagam viagens ao mesmo tempo, então qualquer delta global é uma corrida. Em vez disso, o
     * teste calcula por conta própria o número que o recorte deveria dar e compara com o que o
     * painel devolveu. Se alguém tirar o recorte, os dois passam a divergir por centenas.
     */
    await makeTrip({ status: "received", coletaEmHoras: 24 * 5, sla: "late" });
    await makeTrip({ status: "received", coletaEmHoras: -2, sla: "late" });

    const board = await queryWallboard();
    const fimDeHoje = new Date(dayRangeSaoPaulo(new Date()).to);

    const esperadoAtrasadas = await db
      .select({ v: count() })
      .from(trips)
      .where(
        and(
          inArray(trips.currentStatus, [...ACTIVE_TRIP_STATUSES]),
          inArray(trips.slaStatus, ["late", "breached"]),
          lt(trips.plannedPickupWindowStart, fimDeHoje),
        ),
      );

    expect(board.lateCount).toBe(Number(esperadoAtrasadas[0]!.v));

    // E o recorte tem de estar MORDENDO de verdade: sem ele o número seria maior, porque a viagem
    // de daqui a cinco dias que acabamos de criar entraria.
    const semRecorte = await db
      .select({ v: count() })
      .from(trips)
      .where(
        and(
          inArray(trips.currentStatus, [...ACTIVE_TRIP_STATUSES]),
          inArray(trips.slaStatus, ["late", "breached"]),
        ),
      );
    expect(Number(semRecorte[0]!.v)).toBeGreaterThan(board.lateCount);
  });

  it("a viagem em Recebida não conta como caminhão na estrada", async () => {
    const parada = code("PARADA");
    await makeTrip({ status: "received", externo: parada });
    const board = await queryWallboard();
    expect(board.trips.some((t) => t.externalTripId === parada)).toBe(false);
  });

  it("o carimbo de hora vem do servidor — é o que prova que a TV não congelou", async () => {
    const board = await queryWallboard();
    const idadeMs = Date.now() - new Date(board.generatedAt).getTime();
    expect(idadeMs).toBeGreaterThanOrEqual(0);
    expect(idadeMs).toBeLessThan(30_000);
  });
});
