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
import { tripBoardQueryFromParams } from "@brazil-tms/shared";

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
    const destino = locs[3]!.id;
    const linhas = [locs[0]!.id, locs[0]!.id, locs[1]!.id, locs[2]!.id].map((origem) => ({
      customerId,
      originLocationId: origem,
      destinationLocationId: destino,
      originalPlan: {},
      currentStatus: "received" as const,
      plannedPickupWindowStart: hoje,
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
    const hoje = new Date().toISOString().slice(0, 10);

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
});
