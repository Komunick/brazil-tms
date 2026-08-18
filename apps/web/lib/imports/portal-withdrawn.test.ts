import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  auditLogs,
  customers,
  db,
  locations,
  marcarRetiradasDoPortal,
  marcarVistasNoPortal,
  tripEvents,
  trips,
  users,
} from "@brazil-tms/db";

/**
 * A varredura que APAGA viagem sozinha — e por isso é a que mais precisa de teste.
 *
 * O que se afirma aqui não é o caminho feliz: são as RECUSAS. Uma automação que remove por ausência é
 * útil enquanto acerta e irreversível quando erra, e o modo de errar é sempre o mesmo — o robô parou,
 * o portal devolveu página vazia, e de repente "ninguém apareceu" vira "apague tudo".
 *
 * O `minimoVistas: 1` que aparece na maioria dos casos é o guarda de frescor calibrado para um banco
 * de teste: aqui existem unidades de viagem, não as centenas que um ciclo real carimba. O caso que
 * exercita o guarda de verdade usa o valor alto e é o único que NÃO passa esse parâmetro baixo.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("marcarRetiradasDoPortal (integration)", () => {
  let actorId = "";
  let customerId = "";
  let originId = "";
  let destId = "";
  const criadas: string[] = [];

  const uniq = (p: string): string => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  /** Uma viagem em "Recebida", com coleta amanhã (dentro da janela que o robô varre). */
  async function criar(
    over: { vistaHa?: string | null; status?: "received" | "cancelled" } = {},
  ): Promise<string> {
    const ext = uniq("LH-RET");
    const id = (
      await db
        .insert(trips)
        .values({
          customerId,
          externalTripId: ext,
          legNumber: 1,
          originLocationId: originId,
          destinationLocationId: destId,
          currentStatus: over.status ?? "received",
          plannedPickupWindowStart: sql`now() + interval '1 day'`,
          originalPlan: {},
        })
        .returning({ id: trips.id })
    )[0]!.id;
    criadas.push(id);
    if (over.vistaHa !== null) {
      await db
        .update(trips)
        .set({ portalLastSeenAt: sql`now() - ${over.vistaHa ?? "10 hours"}::interval` })
        .where(eq(trips.id, id));
    }
    return id;
  }

  /** Existe? A pergunta virou essa: a varredura não muda status, ela remove a linha. */
  async function existe(id: string): Promise<boolean> {
    const r = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, id));
    return r.length > 0;
  }

  beforeAll(async () => {
    actorId = (await db.select({ id: users.id }).from(users).limit(1))[0]?.id ?? "";
    expect(actorId).not.toBe("");
    customerId = (
      await db
        .insert(customers)
        .values({ name: "Cliente retiradas", customerCode: uniq("CUST-RET") })
        .returning({ id: customers.id })
    )[0]!.id;
    originId = (
      await db
        .insert(locations)
        .values({ customerId, code: uniq("RO"), name: "Origem" })
        .returning({ id: locations.id })
    )[0]!.id;
    destId = (
      await db
        .insert(locations)
        .values({ customerId, code: uniq("RD"), name: "Destino" })
        .returning({ id: locations.id })
    )[0]!.id;
  });

  afterAll(async () => {
    if (criadas.length) {
      await db.delete(tripEvents).where(inArray(tripEvents.tripId, criadas));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, criadas));
      await db.delete(trips).where(inArray(trips.id, criadas));
    }
    if (originId) await db.delete(locations).where(eq(locations.id, originId));
    if (destId) await db.delete(locations).where(eq(locations.id, destId));
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  });

  it("apaga a que sumiu, e deixa em paz a que o robô acabou de ver", async () => {
    const sumida = await criar({ vistaHa: "10 hours" });
    const presente = await criar({ vistaHa: "1 minute" });

    const r = await marcarRetiradasDoPortal(actorId, { minimoVistas: 1 });
    expect(r.barradoPeloFeed).toBe(false);

    expect(await existe(sumida)).toBe(false);
    // Vista há um minuto: está lá, e nada justifica tocar nela.
    expect(await existe(presente)).toBe(true);
  });

  it("a remoção deixa auditoria — é o único rastro que sobrevive à linha", async () => {
    /**
     * A troca de cancelar por apagar só se sustenta se restar como responder "e a LH que eu vi
     * ontem?". `audit_logs` não tem chave estrangeira para `trips`, então a resposta sobrevive à
     * viagem — e este teste existe para que ela continue sobrevivendo.
     */
    const id = await criar({ vistaHa: "10 hours" });
    const ext = (
      await db.select({ ext: trips.externalTripId }).from(trips).where(eq(trips.id, id))
    )[0]!.ext!;

    await marcarRetiradasDoPortal(actorId, { minimoVistas: 1 });

    expect(await existe(id)).toBe(false);
    const registro = await db
      .select({ acao: auditLogs.action, novo: auditLogs.newValue, motivo: auditLogs.reason })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, id), eq(auditLogs.action, "trip.purge_withdrawn")));
    expect(registro).toHaveLength(1);
    // O número da LH tem de estar lá: sem ele o registro não serve para conferir no portal.
    expect((registro[0]!.novo as { externalTripId?: string }).externalTripId).toBe(ext);
    expect(registro[0]!.motivo).toContain("retirada do portal");
  });

  it("NUNCA toca em viagem que jamais apareceu numa listagem", async () => {
    /**
     * `portalLastSeenAt` nulo é "nunca esteve no portal" — viagem digitada à mão, planilha antiga.
     * Ausência não significa nada para quem nunca esteve lá, e tratar as duas coisas como iguais
     * apagaria em massa tudo o que não vem do robô.
     */
    const manual = await criar({ vistaHa: null });

    await marcarRetiradasDoPortal(actorId, { minimoVistas: 1 });

    expect(await existe(manual)).toBe(true);
  });

  it("NUNCA apaga a que o portal cancelou — essa é história, não fantasma", async () => {
    /**
     * A regra que o usuário deu, e a única distinção que importa: cancelada no portal FICA; some só
     * a que nunca existiu lá. A viagem cancelada some das listagens do portal exatamente como a
     * retirada, então a ausência não as separa — o que as separa é o status daqui.
     *
     * A proteção é estrutural (a varredura só olha `received`), e este teste existe justamente por
     * isso: no dia em que alguém alargar aquele filtro achando que "cancelada também é inativa", é
     * aqui que a operação inteira de canceladas para de ser apagada em silêncio.
     */
    const cancelada = await criar({ vistaHa: "10 hours", status: "cancelled" });

    await marcarRetiradasDoPortal(actorId, { minimoVistas: 1 });

    expect(await existe(cancelada)).toBe(true);
  });

  it("robô parado barra a varredura inteira: sem carimbo recente, nada é apagado", async () => {
    /**
     * A trava do dia ruim, e a que substituiu o teto por contagem de candidatas.
     *
     * O teto olhava para o número de candidatas e não distinguia "o cliente retirou muita coisa" de
     * "o robô morreu" — e com uma pilha acumulada acima dele a varredura passava a não fazer NADA,
     * para sempre, inclusive para as retiradas novas. Medido em produção: 62 candidatas, todas
     * conferidas no portal e nenhuma lá, e a varredura travada de meia em meia hora.
     *
     * O sinal certo é o ROBÔ, não a quantidade: se ele não carimbou centenas de viagens na última
     * hora, ausência não prova nada sobre viagem nenhuma — tenha ela uma ou mil.
     */
    const ids = [await criar({ vistaHa: "10 hours" }), await criar({ vistaHa: "10 hours" })];

    // Sem `minimoVistas`: o mínimo de produção contra um banco de teste é exatamente o retrato de um
    // robô que parou.
    const r = await marcarRetiradasDoPortal(actorId);
    expect({ barrado: r.barradoPeloFeed, removidas: r.removidas }).toEqual({
      barrado: true,
      removidas: 0,
    });

    for (const id of ids) expect(await existe(id)).toBe(true);
  });

  it("o teto limita o TRABALHO de um ciclo, e o resto drena no seguinte", async () => {
    /**
     * A diferença entre esta trava e a anterior é o ponto do conserto: teto atingido não é motivo
     * para não fazer nada — é motivo para fazer um pedaço agora e o resto daqui a meia hora.
     */
    const ids = [await criar({ vistaHa: "10 hours" }), await criar({ vistaHa: "10 hours" })];

    const primeiro = await marcarRetiradasDoPortal(actorId, { teto: 1, minimoVistas: 1 });
    expect({ removidas: primeiro.removidas, limitado: primeiro.limitadoPeloTeto }).toEqual({
      removidas: 1,
      limitado: true,
    });

    // O segundo ciclo vai sem teto de propósito: o caso anterior foi BARRADO e deixou candidatas
    // vivas no banco, então com `teto: 1` dos dois lados a segunda passada poderia gastar sua única
    // vaga numa delas e este teste falharia por contabilidade, não por defeito.
    await marcarRetiradasDoPortal(actorId, { minimoVistas: 1 });
    for (const id of ids) expect(await existe(id)).toBe(false);
  });

  it("ser vista de novo zera o relógio — a aba Aceito conta como ter aparecido", async () => {
    // A viagem some do Planejado assim que é aceita. Se só o Planejado carimbasse, toda viagem
    // aceita viraria "retirada" três horas depois — apagando justamente as que foram em frente.
    const id = await criar({ vistaHa: "10 hours" });
    const ext = (
      await db.select({ ext: trips.externalTripId }).from(trips).where(eq(trips.id, id))
    )[0]!.ext!;

    await marcarVistasNoPortal(customerId, [ext]);
    await marcarRetiradasDoPortal(actorId, { minimoVistas: 1 });

    expect(await existe(id)).toBe(true);
  });
});
