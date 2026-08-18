import { and, eq, inArray, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import { ACTIVE_TRIP_STATUSES, type TripQueue } from "@brazil-tms/shared";
import { db } from "../client";
import { trips } from "../../schema";
import { closeTripFromSource } from "./source-status";

/**
 * A viagem que o cliente RETIROU (2026-08-18).
 *
 * O portal não avisa quando desiste de uma proposta: ela some do Planejado e pronto. Do lado de cá a
 * viagem seguia viva para sempre — cobrando atribuição, alertando, entrando na contagem do dia. Foram
 * duas limpezas manuais em uma noite (60 viagens, depois mais 14) antes de ficar claro que isto não é
 * um resíduo histórico: é o funcionamento normal do portal, e vai acontecer todo dia.
 *
 * A regra é ausência: a viagem tem carimbo de já ter sido vista, o robô continua varrendo a janela
 * onde ela está, e mesmo assim ela não aparece há horas. Isso é o cliente tendo tirado.
 *
 * ── POR QUE ISTO CANCELA E NÃO APAGA ───────────────────────────────────────────────────────────
 *
 * Apagar em massa por ausência é a regra que, no dia em que o robô ler uma página vazia por erro de
 * rede, varre a operação inteira do banco — sem log, sem volta, sem ninguém entender no dia seguinte.
 * Cancelar deixa o registro, a auditoria e o motivo; some do quadro e para de alertar, que é o que a
 * operação precisa; e é reversível por gente. As limpezas manuais que apagaram linhas foram decisão
 * explícita do usuário sobre um conjunto conferido LH a LH — automação não recebe esse poder.
 *
 * ── AS QUATRO TRAVAS ───────────────────────────────────────────────────────────────────────────
 *
 *   SÓ QUEM JÁ FOI VISTA. `portalLastSeenAt` nulo é "nunca apareceu numa listagem" — viagem digitada
 *   à mão, importação de planilha. Ausência não significa nada para quem nunca esteve lá.
 *
 *   SÓ "RECEBIDA". Uma viagem despachada tem motorista e caminhão envolvidos; se sumiu do portal
 *   estando em curso, isso é uma conversa entre pessoas, não um cancelamento automático.
 *
 *   SÓ DENTRO DA JANELA VARRIDA. O robô olha de 15 dias atrás a 7 à frente. Fora disso ele não passa,
 *   e a ausência só diz que ninguém olhou — nunca que o cliente retirou.
 *
 *   E O TETO. Se aparecerem retiradas demais de uma vez, NADA é cancelado e o número é registrado.
 *   Uma varredura sadia acha poucas; dezenas de uma vez é o robô ou o portal quebrado, e nesse caso
 *   a resposta certa é não fazer nada e deixar rastro. É a trava que existe para o dia ruim.
 */

/**
 * As TRÊS filas do que era "Recebida", cada uma como um predicado (2026-08-18).
 *
 * Ficam juntas de propósito: são a mesma pergunta em posições diferentes do ciclo, e escrever uma
 * sem olhar as outras é exatamente como elas passam a se sobrepor ou a deixar buraco. Juntas cobrem
 * `received` inteiro — a soma das três é o total, e há teste contra o banco provando isso.
 *
 * A ordem importa e é a do ciclo de vida: `awaiting_arrival` é testada ANTES da aceitação, porque
 * toda viagem `Assigned` também está `Accepted`. Invertido, ela cairia em "p/atribuir" e mandaria a
 * operação fazer um trabalho que o cliente já fez.
 */
export function tripQueueSql(queue: TripQueue): SQL<boolean> {
  const aceitacao = sql`(${trips.customerFields} ->> 'Aceitação (portal)')`;
  const statusPortal = sql`(${trips.customerFields} ->> 'Status (portal)')`;
  if (queue === "awaiting_arrival") {
    return sql<boolean>`(${statusPortal} = 'Assigned')`;
  }
  if (queue === "in_analysis") {
    return sql<boolean>`(${statusPortal} IS DISTINCT FROM 'Assigned' AND ${aceitacao} = 'Pending')`;
  }
  // `to_assign` é o resto, e é escrito como resto MESMO: `IS DISTINCT FROM` em vez de `NOT (… = …)`
  // porque viagem sem aceitação gravada tem de cair aqui — é o que `displayStatusOf` faz. Com `NOT`,
  // o nulo devolve nulo e ela sumiria da lista, divergindo calada da regra em TypeScript.
  return sql<boolean>`(${statusPortal} IS DISTINCT FROM 'Assigned' AND ${aceitacao} IS DISTINCT FROM 'Pending')`;
}

/** Marca as viagens desta página como VISTAS agora. Uma instrução por página, não uma por viagem. */
export async function marcarVistasNoPortal(
  customerId: string,
  externalTripIds: string[],
): Promise<number> {
  const ids = [...new Set(externalTripIds.filter((v) => v && v.trim() !== ""))];
  if (ids.length === 0) return 0;
  // Sem tocar em `updatedAt`: ser vista de novo não é uma mudança na viagem, e mexer nele
  // remexeria a ordenação e o "mudou alguma coisa?" de todo mundo a cada quinze minutos.
  await db
    .update(trips)
    .set({ portalLastSeenAt: new Date() })
    .where(and(eq(trips.customerId, customerId), inArray(trips.externalTripId, ids)));
  return ids.length;
}

export interface RetiradasResumo {
  /** Quantas se enquadram na regra. */
  candidatas: number;
  /** Quantas foram efetivamente canceladas (zero quando o teto barra). */
  canceladas: number;
  /** Verdadeiro quando o teto barrou a varredura inteira — ver `TETO`. */
  barradoPeloTeto: boolean;
  externalTripIds: string[];
}

/**
 * O teto de segurança. Uma varredura sadia acha unidades; este número é o "isto não pode estar certo".
 *
 * Calibrado sobre o observado: o pior dia medido teve 14 retiradas de uma vez, e as limpezas manuais
 * somaram 60 acumuladas de várias semanas. Trinta por varredura, de quinze em quinze minutos, é folga
 * larga para a operação real e barreira firme para uma leitura quebrada.
 */
export const TETO = 30;

/** Horas sem aparecer em NENHUMA listagem até a ausência valer como retirada. */
export const SILENCIO_HORAS = 3;

export async function marcarRetiradasDoPortal(
  actorUserId: string,
  opcoes: { diasAtras?: number; diasAdiante?: number; silencioHoras?: number; teto?: number } = {},
): Promise<RetiradasResumo> {
  // A janela do robô, espelhada aqui. Se ela mudar lá, muda aqui — e é por isso que são parâmetros.
  const diasAtras = opcoes.diasAtras ?? 15;
  const diasAdiante = opcoes.diasAdiante ?? 7;
  const silencioHoras = opcoes.silencioHoras ?? SILENCIO_HORAS;
  const teto = opcoes.teto ?? TETO;

  const candidatas = await db
    .select({ id: trips.id, externalTripId: trips.externalTripId })
    .from(trips)
    .where(
      and(
        eq(trips.currentStatus, "received"),
        isNotNull(trips.portalLastSeenAt),
        lt(trips.portalLastSeenAt, sql`now() - ${`${silencioHoras} hours`}::interval`),
        sql`${trips.plannedPickupWindowStart} >= now() - ${`${diasAtras} days`}::interval`,
        sql`${trips.plannedPickupWindowStart} <= now() + ${`${diasAdiante} days`}::interval`,
        // Redundante com `received`, e de propósito: se um dia alguém alargar o status acima, a
        // varredura continua incapaz de tocar numa viagem encerrada.
        inArray(trips.currentStatus, [...ACTIVE_TRIP_STATUSES]),
      ),
    );

  const externalTripIds = candidatas.map((c) => c.externalTripId ?? "(sem id)");
  if (candidatas.length === 0) {
    return { candidatas: 0, canceladas: 0, barradoPeloTeto: false, externalTripIds };
  }
  if (candidatas.length > teto) {
    // Nada é cancelado. O número fica registrado para alguém olhar — é sinal de robô parado ou de
    // portal devolvendo página vazia, e nenhuma dessas coisas se conserta cancelando viagem.
    return {
      candidatas: candidatas.length,
      canceladas: 0,
      barradoPeloTeto: true,
      externalTripIds,
    };
  }

  let canceladas = 0;
  for (const c of candidatas) {
    // Uma por vez e com falha isolada: uma viagem que não fecha não pode levar as outras junto.
    try {
      const r = await closeTripFromSource(
        c.id,
        "CANCELADA",
        actorUserId,
        `portal (retirada do Planejado após ${silencioHoras}h sem aparecer)`,
      );
      if (r === "closed") canceladas += 1;
    } catch {
      // Registrada no resumo pela diferença entre candidatas e canceladas.
    }
  }

  return { candidatas: candidatas.length, canceladas, barradoPeloTeto: false, externalTripIds };
}
