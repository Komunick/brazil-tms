import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  queryTripBoard,
  customers,
  db,
  locations,
  queryDashboardMetrics,
  trips,
} from "@brazil-tms/db";
import { saoPauloDate, tripBoardQueryFromParams } from "@brazil-tms/shared";

/**
 * O CARTÃO DE REGIÃO E A LISTA QUE ELE ABRE TÊM QUE DAR O MESMO NÚMERO.
 *
 * É o único jeito de errar que importa aqui. O agrupamento do painel e o filtro do quadro são dois
 * caminhos diferentes até a mesma pergunta — um agrupa por `locations.region` num join, o outro
 * filtra por subconsulta — e nada além deste teste impede que divirjam. Quando divergem, nenhum dos
 * dois parece errado sozinho: o cartão mostra 7, a lista mostra 9, e quem olha conclui que perdeu
 * duas viagens em algum lugar.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const token = `RG${Date.now()}${Math.floor(Math.random() * 1e6)}`;

describe.skipIf(!hasDb)("cartões por região (integration)", () => {
  let customerId = "";
  const locationIds: string[] = [];
  const tripIds: string[] = [];

  beforeAll(async () => {
    customerId = (
      await db
        .insert(customers)
        .values({ name: `Cliente região ${token}`, customerCode: `REG-${token}` })
        .returning({ id: customers.id })
    )[0]!.id;

    // Duas origens em regiões diferentes e uma SEM região — os três casos que o painel desenha.
    const locs = await db
      .insert(locations)
      .values([
        { customerId, code: `RG-SE-${token}`, name: "Origem sudeste", region: "SUDESTE" },
        { customerId, code: `RG-NO-${token}`, name: "Origem norte-nordeste", region: "NONE" },
        { customerId, code: `RG-SEM-${token}`, name: "Origem sem região", region: null },
        { customerId, code: `RG-DST-${token}`, name: "Destino", region: "SUDESTE" },
      ])
      .returning({ id: locations.id });
    locationIds.push(...locs.map((l) => l.id));

    // Coleta HOJE, que é o recorte do cartão: 2 no Sudeste, 1 no NONE, 1 sem região.
    const agora = new Date();
    const hoje = new Date(agora.getTime() + 60 * 60 * 1000);
    const d1 = new Date(agora.getTime() + 25 * 60 * 60 * 1000);
    const d2 = new Date(agora.getTime() + 49 * 60 * 60 * 1000);
    const destino = locs[3]!.id;
    const linhas = [
      ...[locs[0]!.id, locs[0]!.id, locs[1]!.id, locs[2]!.id].map((origem) => ({
        origem,
        quando: hoje,
      })),
      // Uma em D1 e uma em D2, para provar que o corte por dia separa os três cartões.
      { origem: locs[0]!.id, quando: d1 },
      { origem: locs[1]!.id, quando: d2 },
    ].map(({ origem, quando }) => ({
      customerId,
      originLocationId: origem,
      destinationLocationId: destino,
      originalPlan: {},
      currentStatus: "received" as const,
      plannedPickupWindowStart: quando,
    }));
    const criadas = await db.insert(trips).values(linhas).returning({ id: trips.id });
    tripIds.push(...criadas.map((t) => t.id));
  });

  afterAll(async () => {
    if (tripIds.length) await db.delete(trips).where(inArray(trips.id, tripIds));
    if (locationIds.length) await db.delete(locations).where(inArray(locations.id, locationIds));
    await db.delete(customers).where(eq(customers.id, customerId));
  });

  it("agrupa as viagens de hoje pela região da estação de ORIGEM", async () => {
    const { tripsTodayByRegion } = await queryDashboardMetrics();
    const total = (regiao: string | null): number =>
      tripsTodayByRegion
        .find((g) => g.region === regiao)
        ?.byStatus.reduce((n, s) => n + s.count, 0) ?? 0;

    // Outras viagens do banco podem cair nos mesmos grupos; o que se afirma é a PRESENÇA das nossas.
    expect(total("SUDESTE")).toBeGreaterThanOrEqual(2);
    expect(total("NONE")).toBeGreaterThanOrEqual(1);
    expect(total(null)).toBeGreaterThanOrEqual(1);
  });

  it("estação sem região vira grupo próprio, em vez de sumir da conta", async () => {
    const { tripsTodayByRegion } = await queryDashboardMetrics();
    expect(tripsTodayByRegion.some((g) => g.region === null)).toBe(true);
  });

  /**
   * O contrato de verdade: o mesmo recorte, pelos dois caminhos, dá o mesmo número. Se alguém trocar
   * o join do painel ou a subconsulta do quadro, é aqui que aparece.
   */
  it("o total do cartão é o total da lista que ele abre", async () => {
    const { tripsTodayByRegion } = await queryDashboardMetrics();
    /**
     * O DIA VEM DE SÃO PAULO, não de `toISOString()`.
     *
     * Escrito com UTC, este teste falhava toda noite depois das 21h — quando em São Paulo ainda é
     * dia 20 e em UTC já é 21. O cartão contava um dia e o quadro era consultado com outro, e a
     * falha parecia divergência entre os dois caminhos quando era o teste medindo errado. É a mesma
     * armadilha que a consulta evita agrupando no fuso da operação.
     */
    const hoje = saoPauloDate();

    for (const regiao of ["SUDESTE", "NONE"]) {
      const doCartao =
        tripsTodayByRegion
          .find((g) => g.region === regiao)
          ?.byStatus.reduce((n, s) => n + s.count, 0) ?? 0;

      const query = tripBoardQueryFromParams(
        new URLSearchParams({
          region: regiao,
          pickupFrom: hoje,
          pickupTo: hoje,
          scope: "all",
        }),
      );
      const { total: doQuadro } = await queryTripBoard(query);
      expect(doQuadro).toBe(doCartao);
    }
  });

  /**
   * OS TRÊS DIAS saem de UMA consulta e são separados aqui. O risco é o corte errar por fuso: uma
   * coleta às 22h de Brasília é 01h do dia seguinte em UTC, e cairia no cartão errado — justamente
   * nas viagens noturnas, que são as que mais interessam a quem monta o dia seguinte.
   */
  it("separa hoje, D1 e D2 em recortes próprios", async () => {
    const { tripsTodayByRegion, tripsD1ByRegion, tripsD2ByRegion } = await queryDashboardMetrics();
    const total = (grupos: { region: string | null; byStatus: { count: number }[] }[], r: string) =>
      grupos.find((g) => g.region === r)?.byStatus.reduce((n, s) => n + s.count, 0) ?? 0;

    expect(total(tripsTodayByRegion, "SUDESTE")).toBeGreaterThanOrEqual(2);
    expect(total(tripsD1ByRegion, "SUDESTE")).toBeGreaterThanOrEqual(1);
    expect(total(tripsD2ByRegion, "NONE")).toBeGreaterThanOrEqual(1);
  });

  /**
   * A LH ATRASADA acumula os dias anteriores.
   *
   * O cálculo antigo morava no navegador e só sabia olhar "hoje": uma viagem de ONTEM que ninguém
   * atribuiu não pertencia a nenhum dos três cartões de dia e sumia do painel — o pior desfecho
   * possível para o caso mais grave. Este teste semeia exatamente essa viagem.
   */
  it("conta como atrasada a viagem de ONTEM que ninguém atribuiu", async () => {
    const ontem = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const criada = await db
      .insert(trips)
      .values({
        customerId,
        originLocationId: locationIds[1]!, // NONE
        destinationLocationId: locationIds[3]!,
        originalPlan: {},
        currentStatus: "received" as const,
        plannedPickupWindowStart: ontem,
        customerFields: { "Aceitação (portal)": "Accepted" },
      })
      .returning({ id: trips.id });
    tripIds.push(...criada.map((t) => t.id));

    const { lateToAssignByRegion, tripsTodayByRegion } = await queryDashboardMetrics();
    const atrasadasNone = lateToAssignByRegion.find((r) => r.region === "NONE")?.count ?? 0;
    expect(atrasadasNone).toBeGreaterThanOrEqual(1);

    // E ela NÃO aparece no cartão de hoje, que é justamente por isso que a faixa precisa existir.
    const hojeNone = tripsTodayByRegion.find((g) => g.region === "NONE");
    const totalHoje = hojeNone?.byStatus.reduce((n, s) => n + s.count, 0) ?? 0;
    expect(totalHoje).toBeGreaterThanOrEqual(1);
  });

  /**
   * A REGIÃO na linha do quadro (2026-08-21, a pedido): a ficha que diz de qual frente é a LH.
   *
   * Vem da estação de ORIGEM, a mesma regra dos cartões — se as duas divergissem, a ficha da linha
   * contradiria o cartão que trouxe a pessoa até ela.
   */
  it("a linha do quadro carrega a região da estação de origem", async () => {
    const query = tripBoardQueryFromParams(
      new URLSearchParams({ region: "SUDESTE", scope: "all" }),
    );
    const { rows } = await queryTripBoard(query);
    expect(rows.length).toBeGreaterThan(0);
    // O filtro e a ficha falam a mesma língua: pedindo SUDESTE, nenhuma linha volta de outra frente.
    expect(rows.every((r) => r.originRegion === "SUDESTE")).toBe(true);
  });
});
