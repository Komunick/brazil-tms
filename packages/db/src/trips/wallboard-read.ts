import { alias } from "drizzle-orm/pg-core";
import { and, asc, count, eq, gte, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { dayRangeSaoPaulo, type TripStatus } from "@brazil-tms/shared";
import { db } from "../client";
import { locations, tripAssignments, trips } from "../../schema";

/**
 * O painel de parede (2026-08-16).
 *
 * Uma TV ligada no meio da sala não é uma tela de computador menor: ninguém clica nela, ninguém
 * rola, e quem lê está a três metros de distância e de passagem. Então este modelo de leitura
 * entrega EXATAMENTE o que cabe numa tela, já ordenado, numa única consulta por ciclo — nada de
 * paginar, nada de filtrar depois, nada de o navegador escolher o que mostrar.
 *
 * O conteúdo é a operação AGORA, não o resumo do dia: quantos caminhões em cada etapa, quais estão
 * rodando neste momento e para onde, e o que está atrasado. Indicador de mês não muda decisão de
 * ninguém às onze da noite; um caminhão que deveria ter chegado às 22:00 muda.
 */

const wallOrigin = alias(locations, "wall_origin");
const wallDest = alias(locations, "wall_dest");

/** As etapas em que existe caminhão rodando — a viagem saiu e ainda não encerrou. */
export const ON_THE_ROAD_STATUSES = [
  "at_origin",
  "loading",
  "loaded",
  "in_transit",
  "at_destination",
  "unloading",
  "unloaded",
] as const satisfies readonly TripStatus[];

export interface WallboardTrip {
  id: string;
  externalTripId: string | null;
  currentStatus: TripStatus;
  originCode: string | null;
  originName: string | null;
  destinationCode: string | null;
  destinationName: string | null;
  /** Quando o cliente espera a entrega — o número que a sala precisa comparar com o relógio. */
  plannedDeliveryAt: string | null;
  /** O julgamento do próprio TMS, não uma conta feita na tela. */
  slaStatus: string | null;
  driverLabel: string | null;
  plateLabel: string | null;
}

export interface WallboardSummary {
  /** Contagem por etapa, só das que têm caminhão na rua. Etapa vazia vem com zero, não some. */
  onTheRoad: { status: TripStatus; count: number }[];
  /** As viagens rodando agora, as mais urgentes primeiro. */
  trips: WallboardTrip[];
  /** Quantas existem ao todo — a lista mostra as primeiras, e o rodapé não pode mentir sobre o resto. */
  tripsTotal: number;
  /** Atrasadas entre as que estão em jogo hoje — na rua agora ou programadas para hoje. */
  lateCount: number;
  /** Sem motorista, mesmo recorte. */
  unassignedCount: number;
  tripsTodayCount: number;
  /** Carimbo do servidor: é o que prova que a TV não congelou numa tela velha. */
  generatedAt: string;
}

/** Quantas viagens a TV lista antes de dizer "e mais N". Cabe numa tela de 1080p sem rolar. */
const WALL_ROWS = 12;

/**
 * O que está EM JOGO HOJE — o único recorte que faz sentido num rodapé de parede (2026-08-17).
 *
 * Duas versões erradas antes desta, e as duas pela mesma razão: o número era verdadeiro e não era
 * acionável.
 *
 *   1. Toda viagem ativa → 782 "sem motorista", somando a semana inteira que o cliente nem designou.
 *   2. Tudo até o fim de hoje → 161, e crescendo sozinho: virou o acúmulo dos 15 dias que o robô
 *      passou a enxergar. Um contador que só sobe não é pendência, é paisagem.
 *
 * Em jogo hoje é: o caminhão que está na rua AGORA, mais a viagem programada para hoje que ainda
 * não saiu. Dá 14 atrasadas e 46 sem motorista contra 131 e 161 — e essas a sala resolve.
 *
 * A viagem de 12/08 parada esperando aceitação continua existindo e continua alertando; ela é
 * assunto da Torre, onde alguém senta e trabalha nela. Não é assunto de uma parede.
 */
function emJogoHoje(from: string, to: string): SQL {
  return or(
    inArray(trips.currentStatus, [...ON_THE_ROAD_STATUSES]),
    and(
      inArray(trips.currentStatus, PRE_PARTIDA),
      gte(trips.plannedPickupWindowStart, new Date(from)),
      lt(trips.plannedPickupWindowStart, new Date(to)),
    ),
  )!;
}

/** Antes de sair: a viagem ainda está no pátio, e é aí que o despacho age. */
const PRE_PARTIDA = ["received", "assigned", "confirmed"] as const satisfies readonly TripStatus[];

export async function queryWallboard(): Promise<WallboardSummary> {
  const { from, to } = dayRangeSaoPaulo(new Date());
  const naRua = [...ON_THE_ROAD_STATUSES];

  const [porEtapa, viagens, totalNaRua, atrasadas, semAtribuicao, hoje] = await Promise.all([
    db
      .select({ status: trips.currentStatus, value: count() })
      .from(trips)
      .where(inArray(trips.currentStatus, naRua))
      .groupBy(trips.currentStatus),

    /**
     * A ordem é a única coisa que importa numa lista cortada: o que sai da tela tem de ser o menos
     * urgente. Atrasada primeiro, depois por horário de entrega — quem chega antes, aparece antes.
     * Sem isso, cortar em 12 seria cortar ao acaso.
     */
    db
      .select({
        id: trips.id,
        externalTripId: trips.externalTripId,
        currentStatus: trips.currentStatus,
        originCode: wallOrigin.code,
        originName: wallOrigin.name,
        destinationCode: wallDest.code,
        destinationName: wallDest.name,
        plannedDeliveryAt: trips.plannedDeliveryWindowEnd,
        slaStatus: trips.slaStatus,
        customerFields: trips.customerFields,
      })
      .from(trips)
      .leftJoin(wallOrigin, eq(trips.originLocationId, wallOrigin.id))
      .leftJoin(wallDest, eq(trips.destinationLocationId, wallDest.id))
      .where(inArray(trips.currentStatus, naRua))
      .orderBy(
        sql`case when ${trips.slaStatus} in ('late','breached') then 0 else 1 end`,
        asc(trips.plannedDeliveryWindowEnd),
      )
      .limit(WALL_ROWS),

    db.select({ value: count() }).from(trips).where(inArray(trips.currentStatus, naRua)),

    db
      .select({ value: count() })
      .from(trips)
      .where(and(emJogoHoje(from, to), inArray(trips.slaStatus, ["late", "breached"]))),

    db
      .select({ value: count() })
      .from(trips)
      .where(
        and(
          emJogoHoje(from, to),
          sql`NOT EXISTS (
              SELECT 1 FROM ${tripAssignments}
              WHERE ${tripAssignments.tripId} = ${trips.id} AND ${tripAssignments.isCurrent}
            )`,
        ),
      ),

    db
      .select({ value: count() })
      .from(trips)
      .where(
        and(
          gte(trips.plannedPickupWindowStart, new Date(from)),
          lt(trips.plannedPickupWindowStart, new Date(to)),
        ),
      ),
  ]);

  // Etapa sem nenhuma viagem continua na tela, com zero: uma coluna que some faz o olho procurar o
  // que mudou de lugar, e numa parede isso é pior do que um zero.
  const contagem = new Map(porEtapa.map((r) => [r.status as TripStatus, Number(r.value)]));

  return {
    onTheRoad: ON_THE_ROAD_STATUSES.map((status) => ({
      status,
      count: contagem.get(status) ?? 0,
    })),
    trips: viagens.map((r) => {
      const campos = (r.customerFields ?? {}) as Record<string, string>;
      return {
        id: r.id,
        externalTripId: r.externalTripId,
        currentStatus: r.currentStatus as TripStatus,
        originCode: r.originCode,
        originName: r.originName,
        destinationCode: r.destinationCode,
        destinationName: r.destinationName,
        plannedDeliveryAt: r.plannedDeliveryAt ? r.plannedDeliveryAt.toISOString() : null,
        slaStatus: r.slaStatus,
        // O que o cliente diz, que é o que existe mesmo quando o vínculo com a frota não fechou.
        driverLabel: campos["Motorista (portal)"] ?? null,
        plateLabel: campos["Placa (portal)"] ?? null,
      };
    }),
    tripsTotal: Number(totalNaRua[0]?.value ?? 0),
    lateCount: Number(atrasadas[0]?.value ?? 0),
    unassignedCount: Number(semAtribuicao[0]?.value ?? 0),
    tripsTodayCount: Number(hoje[0]?.value ?? 0),
    generatedAt: new Date().toISOString(),
  };
}
