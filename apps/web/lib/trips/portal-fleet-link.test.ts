import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  carriers,
  customers,
  db,
  drivers,
  linkFleetFromPortal,
  locations,
  tripAssignments,
  tripEvents,
  trips,
  users,
  vehicles,
} from "@brazil-tms/db";
import type { PortalTrip } from "@brazil-tms/shared";

/**
 * O caminhão que o portal cita e a frota não tem (2026-08-19).
 *
 * O motorista chega ao TMS por uma exportação que alguém precisa lembrar de fazer; a placa chega
 * junto da VIAGEM, de graça, a cada ciclo. Enquanto o vínculo exigia as duas coisas já cadastradas,
 * a assimetria aparecia na tela: 6 das 8 viagens que ficavam "NA ORIGEM sem ninguém" tinham o
 * motorista certo e só faltava a placa.
 *
 * Estes casos trancam as duas metades da regra: cria quando o cliente disse o tipo, e NÃO cria
 * quando não disse — porque a coluna é obrigatória e a compatibilidade de veículo decide atribuição,
 * então um tipo inventado poria o caminhão errado no despacho.
 *
 * Integração contra banco vivo; pula sem `DATABASE_URL`, como os vizinhos.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("linkFleetFromPortal — cadastro automático do veículo", () => {
  let actorId = "";
  let customerId = "";
  let originLocationId = "";
  let destinationLocationId = "";
  let carrierId = "";
  let driverName = "";
  const criados = { trips: [] as string[], drivers: [] as string[], plates: [] as string[] };

  const code = (p: string): string => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  /** Placa nova a cada caso: o vínculo é justamente sobre placa que ainda não existe. */
  const placaNova = (): string => {
    const n = Math.floor(Math.random() * 9e6 + 1e6);
    const p = `TST${String(n).slice(0, 4)}`;
    criados.plates.push(p);
    return p;
  };

  /** O que o robô entrega: nome do motorista e placas, nada mais. */
  const portalTrip = (plate: string): PortalTrip =>
    ({ driverLabel: driverName, plateLabel: plate }) as unknown as PortalTrip;

  /**
   * UM DIA POR VIAGEM, EM SEQUÊNCIA — não sorteado.
   *
   * O dia saía de `Math.random() * 27`, e o MESMO motorista dirige todas as viagens deste arquivo.
   * Dois sorteios iguais punham esse motorista em duas viagens ao mesmo tempo, o avaliador acusava
   * conflito de agenda, e um caso que esperava `already_assigned` recebia `blocked`.
   *
   * Medido em 2026-08-20: 3 falhas em 20 execuções do arquivo sozinho. O código estava certo — o
   * teste é que se atropelava. Um contador dá a cada viagem uma janela só dela, e a colisão deixa
   * de existir em vez de ficar improvável.
   */
  let proximoDia = 0;

  async function inserirViagem(plannedVehicleType: "truck" | null): Promise<string> {
    // Setembro de 2026 tem 30 dias e este arquivo cria menos de dez viagens; a volta é só um
    // seguro para quem acrescentar casos depois.
    proximoDia += 1;
    const dia = String(((proximoDia - 1) % 28) + 1).padStart(2, "0");
    const inserted = await db
      .insert(trips)
      .values({
        customerId,
        originLocationId,
        destinationLocationId,
        originalPlan: {},
        currentStatus: "received",
        plannedVehicleType,
        plannedPickupWindowStart: new Date(`2026-09-${dia}T08:00:00.000Z`),
        plannedDeliveryWindowEnd: new Date(`2026-09-${dia}T18:00:00.000Z`),
      })
      .returning();
    const id = inserted[0]!.id;
    criados.trips.push(id);
    return id;
  }

  beforeAll(async () => {
    const admin = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@braziltransports.com.br"))
      .limit(1);
    actorId = admin[0]?.id ?? "";
    expect(actorId, "admin semeado precisa existir (rode db:seed)").not.toBe("");

    const cust = await db
      .insert(customers)
      .values({ name: "Cliente Frota Auto", customerCode: code("CUST-FA") })
      .returning();
    customerId = cust[0]!.id;

    const org = await db
      .insert(locations)
      .values({ customerId, name: "Origem FA", code: code("ORI-FA") })
      .returning();
    originLocationId = org[0]!.id;
    const dst = await db
      .insert(locations)
      .values({ customerId, name: "Destino FA", code: code("DST-FA") })
      .returning();
    destinationLocationId = dst[0]!.id;

    const carr = await db
      .insert(carriers)
      .values({ name: `Transportadora FA ${code("C")}` })
      .returning();
    carrierId = carr[0]!.id;

    // Subcontratado de propósito: é a forma da frota real (883 de 982 motoristas), e é ela que
    // exige transportadora na atribuição.
    driverName = `MOTORISTA FROTA AUTO ${code("D")}`;
    const drv = await db
      .insert(drivers)
      .values({
        name: driverName,
        ownershipType: "subcontracted",
        carrierId,
        status: "active",
        licenseExpiry: "2035-01-01",
      })
      .returning();
    criados.drivers.push(drv[0]!.id);
  });

  afterAll(async () => {
    for (const id of criados.trips) {
      // `trip_events` primeiro: a atribuição escreve um `status_change`, e a chave estrangeira dele
      // segura a viagem.
      await db.delete(tripEvents).where(eq(tripEvents.tripId, id));
      await db.delete(tripAssignments).where(eq(tripAssignments.tripId, id));
      await db.delete(trips).where(eq(trips.id, id));
    }
    for (const p of criados.plates) {
      await db.delete(vehicles).where(eq(vehicles.plate, p));
    }
    for (const id of criados.drivers) await db.delete(drivers).where(eq(drivers.id, id));
    if (carrierId) await db.delete(carriers).where(eq(carriers.id, carrierId));
    if (originLocationId) await db.delete(locations).where(eq(locations.id, originLocationId));
    if (destinationLocationId)
      await db.delete(locations).where(eq(locations.id, destinationLocationId));
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  });

  it("cadastra o caminhão que falta e VINCULA, em vez de devolver 'sem cadastro'", async () => {
    const placa = placaNova();
    const tripId = await inserirViagem("truck");

    const r = await linkFleetFromPortal(tripId, portalTrip(placa), actorId);
    expect(["linked", "linked_with_warnings"]).toContain(r.outcome);

    // O veículo passou a existir, com o tipo que o CLIENTE declarou — não um palpite nosso.
    const v = await db.select().from(vehicles).where(eq(vehicles.plate, placa)).limit(1);
    expect(v[0]?.vehicleType).toBe("truck");
    // E herdou a transportadora do motorista: é com a pessoa que o contrato existe.
    expect(v[0]?.ownershipType).toBe("subcontracted");
    expect(v[0]?.carrierId).toBe(carrierId);

    const asg = await db
      .select()
      .from(tripAssignments)
      .where(and(eq(tripAssignments.tripId, tripId), eq(tripAssignments.isCurrent, true)));
    expect(asg).toHaveLength(1);
  });

  it("NÃO cria nada quando o cliente não declarou o tipo — devolve 'sem cadastro'", async () => {
    /**
     * Sem `planned_vehicle_type` não há de onde tirar o tipo, e a coluna é obrigatória. Inventar um
     * ("carreta serve") poria um caminhão do tipo errado no despacho, onde a compatibilidade decide
     * atribuição — o oposto do que a automação existe para fazer.
     */
    const placa = placaNova();
    const tripId = await inserirViagem(null);

    const r = await linkFleetFromPortal(tripId, portalTrip(placa), actorId);
    expect(r.outcome).toBe("no_match");
    expect(r.detail).toContain(placa);

    const v = await db.select().from(vehicles).where(eq(vehicles.plate, placa));
    expect(v).toHaveLength(0);
  });

  it("o PORTAL manda: trocou o caminhão lá, o TMS substitui aqui", async () => {
    /**
     * O bug (produção, 2026-08-19): o vínculo parava em "já tem atribuição" e o cliente TROCA. Quinze
     * viagens ficaram com motorista e placa diferentes do que o portal dizia.
     *
     * E o dano não era só o dado velho: pela regra de conflito de agenda, a placa antiga BLOQUEAVA a
     * viagem que de fato tinha aquele caminhão. `LT0Q8J02E2LN1` guardava a `ATM8A55` enquanto o
     * portal já dizia `MKK6B69`, e a `LT0Q8J02E2LW1` — dona real da `ATM8A55` — ficava sem ninguém.
     */
    const placaVelha = placaNova();
    const placaNoPortal = placaNova();
    const tripId = await inserirViagem("truck");

    await linkFleetFromPortal(tripId, portalTrip(placaVelha), actorId);
    const antes = await db
      .select({ vehicleId: tripAssignments.vehicleId })
      .from(tripAssignments)
      .where(and(eq(tripAssignments.tripId, tripId), eq(tripAssignments.isCurrent, true)));
    expect(antes).toHaveLength(1);

    // O cliente trocou o caminhão no portal. O ciclo seguinte traz a placa nova.
    const r = await linkFleetFromPortal(tripId, portalTrip(placaNoPortal), actorId);
    expect(["linked", "linked_with_warnings"]).toContain(r.outcome);

    const depois = await db
      .select({ vehicleId: tripAssignments.vehicleId })
      .from(tripAssignments)
      .where(and(eq(tripAssignments.tripId, tripId), eq(tripAssignments.isCurrent, true)));
    // EXATAMENTE UMA corrente, e é a do portal — a antiga foi superseded, não apagada.
    expect(depois).toHaveLength(1);
    expect(depois[0]!.vehicleId).not.toBe(antes[0]!.vehicleId);

    const historico = await db
      .select({ id: tripAssignments.id })
      .from(tripAssignments)
      .where(eq(tripAssignments.tripId, tripId));
    expect(historico.length).toBe(2);
  });

  it("sem troca no portal, não mexe: o mesmo par devolve 'já atribuída'", async () => {
    // O ciclo do robô repete a cada poucos minutos. Sem esta guarda, cada passada substituiria a
    // atribuição por uma igual e encheria o histórico de linhas idênticas.
    const placa = placaNova();
    const tripId = await inserirViagem("truck");
    await linkFleetFromPortal(tripId, portalTrip(placa), actorId);
    const r = await linkFleetFromPortal(tripId, portalTrip(placa), actorId);
    expect(r.outcome).toBe("already_assigned");
  });

  it("CNH vencida NÃO impede mais o vínculo — atribui e deixa o motivo gravado", async () => {
    /**
     * Decisão do usuário (2026-08-19), sobre a `LT0Q8J02DZHQ1`: ELENO ALEXANDRE BISPO, CNH vencida em
     * 09/01/2026, escalado pelo portal assim mesmo. O TMS recusava — documento vencido é bloqueio
     * duro — e a viagem ficava sem motorista no quadro.
     *
     * Recusar não impedia a viagem de acontecer; só escondia quem estava dirigindo. Agora atribui, e
     * o risco fica VISÍVEL: o motivo na atribuição e um aviso vermelho na tela da viagem.
     */
    const vencido = `MOTORISTA CNH VENCIDA ${code("V")}`;
    const drv = await db
      .insert(drivers)
      .values({
        name: vencido,
        ownershipType: "subcontracted",
        carrierId,
        status: "active",
        licenseExpiry: "2026-01-09",
      })
      .returning();
    criados.drivers.push(drv[0]!.id);

    const placa = placaNova();
    const tripId = await inserirViagem("truck");
    const r = await linkFleetFromPortal(
      tripId,
      { driverLabel: vencido, plateLabel: placa } as unknown as PortalTrip,
      actorId,
    );

    expect(r.outcome).toBe("linked_with_warnings");
    const asg = await db
      .select({ overrideReason: tripAssignments.overrideReason })
      .from(tripAssignments)
      .where(and(eq(tripAssignments.tripId, tripId), eq(tripAssignments.isCurrent, true)));
    expect(asg).toHaveLength(1);
    // O motivo diz o que foi aceito. Sem isso, o dia seguinte não sabe por que passou.
    expect(asg[0]!.overrideReason).toContain("CNH DO MOTORISTA VENCIDA");
  });

  it("a exceção é SÓ da CNH: motorista inativo continua barrado", async () => {
    // A decisão foi sobre a validade da carteira, não sobre bloquear menos. Um motorista que o
    // cliente desativou continua fora — e é justamente o caso que o carregador marca como inativo.
    const inativo = `MOTORISTA INATIVO ${code("I")}`;
    const drv = await db
      .insert(drivers)
      .values({
        name: inativo,
        ownershipType: "subcontracted",
        carrierId,
        status: "inactive",
        licenseExpiry: "2035-01-01",
      })
      .returning();
    criados.drivers.push(drv[0]!.id);

    const placa = placaNova();
    const tripId = await inserirViagem("truck");
    const r = await linkFleetFromPortal(
      tripId,
      { driverLabel: inativo, plateLabel: placa } as unknown as PortalTrip,
      actorId,
    );
    // Motorista inativo nem é encontrado pela busca (ela exige `active`), então o resultado é
    // "sem cadastro" — e o importante é que NÃO vira atribuição.
    expect(r.outcome).not.toBe("linked");
    expect(r.outcome).not.toBe("linked_with_warnings");
    const asg = await db
      .select()
      .from(tripAssignments)
      .where(and(eq(tripAssignments.tripId, tripId), eq(tripAssignments.isCurrent, true)));
    expect(asg).toHaveLength(0);
  });

  it("não duplica: rodar de novo reaproveita o veículo criado no ciclo anterior", async () => {
    // O robô repete o ciclo a cada poucos minutos. Sem esta garantia, cada passada criaria uma
    // placa nova — e placa duplicada faz o casamento escolher uma ao acaso.
    const placa = placaNova();
    const t1 = await inserirViagem("truck");
    const t2 = await inserirViagem("truck");

    await linkFleetFromPortal(t1, portalTrip(placa), actorId);
    await linkFleetFromPortal(t2, portalTrip(placa), actorId);

    const quantos = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(vehicles)
      .where(eq(vehicles.plate, placa));
    expect(quantos[0]?.n).toBe(1);
  });
});
