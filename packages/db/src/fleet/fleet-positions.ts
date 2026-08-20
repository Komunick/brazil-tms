import { desc, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { APP_TIME_ZONE, type FleetPositionInput } from "@brazil-tms/shared";
import { db } from "../client";
import { fleetPositions, vehicles } from "../../schema";

/**
 * O retrato da frota que o rastreador entrega, gravado (2026-08-20).
 *
 * Ver `schema/fleet-positions.ts` para o porquê de uma linha por placa. Aqui ficam as três decisões
 * de tradução: a placa, o fuso e o vínculo com a frota cadastrada.
 */

export interface FleetPositionView {
  plate: string;
  vehicleId: string | null;
  trailerPlate: string | null;
  driverLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  positionLabel: string | null;
  positionAt: string | null;
  ignition: string | null;
  tripStatus: string | null;
  originCity: string | null;
  destinationCity: string | null;
  tripStartedAt: string | null;
  etaAt: string | null;
  progressPercent: number | null;
  kmTravelled: number | null;
  stoppedMinutes: number | null;
  offRoute: string | null;
  noPosition: string | null;
  stoppedFlag: string | null;
  receivedAt: string;
}

export interface FleetFeedResult {
  /** Quantas linhas o lote trouxe, depois de descartar placa vazia. */
  recebidas: number;
  /** Quantas casaram com um veículo cadastrado. */
  vinculadas: number;
  /** As placas que o rastreador vê e o TMS não tem cadastradas. */
  semCadastro: string[];
}

/**
 * A placa como CHAVE, não como texto de tela.
 *
 * O rastreador escreve `OWR4I30`, o cadastro do TMS pode ter `OWR-4I30`, e uma placa Mercosul
 * digitada em minúscula é a mesma placa. Comparar sem normalizar faz o vínculo falhar em silêncio —
 * e o sintoma seria "o TMS não conhece este caminhão", que é uma afirmação falsa e cara.
 */
export function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Um instante do rastreador vira UTC.
 *
 * Ele escreve `"2026-08-19 21:10:12"`, sem fuso nenhum, e é horário de São Paulo. A conversão mora
 * AQUI e não no robô de propósito: no navegador ela dependeria do relógio e do fuso de uma VM, que é
 * a última coisa em que se deve confiar para gravar dado que alimenta cálculo de atraso. A VM já
 * esteve com o relógio certo por sorte, não por configuração.
 *
 * Valor vazio, `"-"` ou impossível de ler devolve null — o campo some da tela, em vez de virar 1970.
 */
function paraUtc(valor: string | null | undefined): Date | null {
  const texto = (valor ?? "").trim();
  if (texto === "" || texto === "-") return null;
  const iso = DateTime.fromISO(texto, { zone: APP_TIME_ZONE });
  if (iso.isValid) return iso.toJSDate();
  const comEspaco = DateTime.fromFormat(texto, "yyyy-MM-dd HH:mm:ss", { zone: APP_TIME_ZONE });
  if (comEspaco.isValid) return comEspaco.toJSDate();
  const brasileiro = DateTime.fromFormat(texto, "dd/MM/yyyy HH:mm:ss", { zone: APP_TIME_ZONE });
  return brasileiro.isValid ? brasileiro.toJSDate() : null;
}

/** `"0"`, `0` e `null` são a mesma coisa aqui; texto que não é número vira null. */
function paraInteiro(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * O `-1` do rastreador vira null.
 *
 * Ele usa `-1` para "não se aplica" em percentual e quilometragem — caminhão sem viagem não tem
 * progresso a medir. Onze dos 84 do primeiro lote real vieram assim. Gravado como número, ele
 * apareceria na tela como `-1%`, que é pior do que um traço: parece medição, e medição errada é a
 * única coisa pior do que medição ausente.
 */
const semSentinela = (valor: number | null | undefined): number | null =>
  valor === null || valor === undefined || valor < 0 ? null : valor;

const texto = (valor: string | null | undefined): string | null => {
  const t = (valor ?? "").trim();
  return t === "" || t === "-" ? null : t;
};

/**
 * Grava o retrato inteiro, sobrescrevendo o anterior de cada placa.
 *
 * TUDO NUMA TRANSAÇÃO SÓ: o lote é um retrato de um instante, e meio retrato gravado seria pior do
 * que nenhum — a tela mostraria metade da frota às 21h10 e a outra metade às 21h05, sem nada
 * dizendo qual é qual.
 *
 * Placas sem cadastro NÃO impedem a gravação; elas voltam no resumo para quem quiser cadastrar. O
 * caminhão que o rastreador vê e o TMS não conhece é exatamente o que se quer enxergar.
 */
export async function recordFleetPositions(
  entradas: FleetPositionInput[],
): Promise<FleetFeedResult> {
  const linhas = entradas
    .map((e) => ({ ...e, plate: normalizePlate(e.plate) }))
    .filter((e) => e.plate !== "");
  if (linhas.length === 0) return { recebidas: 0, vinculadas: 0, semCadastro: [] };

  // Um SELECT para a frota inteira, não um por placa: 98 consultas por ciclo seriam 98 idas ao banco
  // a cada cinco minutos para responder a mesma pergunta.
  const cadastrados = await db.select({ id: vehicles.id, plate: vehicles.plate }).from(vehicles);
  const porPlaca = new Map(cadastrados.map((v) => [normalizePlate(v.plate), v.id]));

  const valores = linhas.map((e) => ({
    plate: e.plate,
    vehicleId: porPlaca.get(e.plate) ?? null,
    trailerPlate: texto(e.trailerPlate) ? normalizePlate(e.trailerPlate!) : null,
    driverLabel: texto(e.driverLabel),
    latitude: e.latitude ?? null,
    longitude: e.longitude ?? null,
    positionLabel: texto(e.positionLabel),
    positionAt: paraUtc(e.positionAt),
    ignition: texto(e.ignition),
    tripStatus: texto(e.tripStatus),
    originCity: texto(e.originCity),
    destinationCity: texto(e.destinationCity),
    tripStartedAt: paraUtc(e.tripStartedAt),
    etaAt: paraUtc(e.etaAt),
    progressPercent: semSentinela(e.progressPercent),
    kmTravelled: semSentinela(e.kmTravelled),
    stoppedMinutes: paraInteiro(e.stoppedMinutes),
    offRoute: texto(e.offRoute),
    noPosition: texto(e.noPosition),
    stoppedFlag: texto(e.stoppedFlag),
    receivedAt: new Date(),
  }));

  await db
    .insert(fleetPositions)
    .values(valores)
    .onConflictDoUpdate({
      target: fleetPositions.plate,
      set: {
        vehicleId: sql`excluded.vehicle_id`,
        trailerPlate: sql`excluded.trailer_plate`,
        driverLabel: sql`excluded.driver_label`,
        latitude: sql`excluded.latitude`,
        longitude: sql`excluded.longitude`,
        positionLabel: sql`excluded.position_label`,
        positionAt: sql`excluded.position_at`,
        ignition: sql`excluded.ignition`,
        tripStatus: sql`excluded.trip_status`,
        originCity: sql`excluded.origin_city`,
        destinationCity: sql`excluded.destination_city`,
        tripStartedAt: sql`excluded.trip_started_at`,
        etaAt: sql`excluded.eta_at`,
        progressPercent: sql`excluded.progress_percent`,
        kmTravelled: sql`excluded.km_travelled`,
        stoppedMinutes: sql`excluded.stopped_minutes`,
        offRoute: sql`excluded.off_route`,
        noPosition: sql`excluded.no_position`,
        stoppedFlag: sql`excluded.stopped_flag`,
        receivedAt: sql`excluded.received_at`,
      },
    });

  return {
    recebidas: valores.length,
    vinculadas: valores.filter((v) => v.vehicleId !== null).length,
    semCadastro: valores.filter((v) => v.vehicleId === null).map((v) => v.plate),
  };
}

/** O retrato inteiro, do mais recente para o mais antigo — a página de rastreamento lê daqui. */
export async function readFleetPositions(): Promise<FleetPositionView[]> {
  const linhas = await db.select().from(fleetPositions).orderBy(desc(fleetPositions.receivedAt));
  return linhas.map((r) => ({
    plate: r.plate,
    vehicleId: r.vehicleId,
    trailerPlate: r.trailerPlate,
    driverLabel: r.driverLabel,
    latitude: r.latitude,
    longitude: r.longitude,
    positionLabel: r.positionLabel,
    positionAt: r.positionAt?.toISOString() ?? null,
    ignition: r.ignition,
    tripStatus: r.tripStatus,
    originCity: r.originCity,
    destinationCity: r.destinationCity,
    tripStartedAt: r.tripStartedAt?.toISOString() ?? null,
    etaAt: r.etaAt?.toISOString() ?? null,
    progressPercent: r.progressPercent,
    kmTravelled: r.kmTravelled,
    stoppedMinutes: r.stoppedMinutes,
    offRoute: r.offRoute,
    noPosition: r.noPosition,
    stoppedFlag: r.stoppedFlag,
    receivedAt: r.receivedAt.toISOString(),
  }));
}

/** A leitura mais recente, para o Status do Sistema saber se o robô do rastreador ainda está vivo. */
export async function lastFleetPositionAt(): Promise<Date | null> {
  const linha = await db
    .select({ receivedAt: fleetPositions.receivedAt })
    .from(fleetPositions)
    .orderBy(desc(fleetPositions.receivedAt))
    .limit(1);
  return linha[0]?.receivedAt ?? null;
}

export interface FleetSummary {
  /** Quantos veículos o rastreador conhece nesta conta. */
  total: number;
  /** Andando agora, segundo o próprio rastreador. */
  moving: number;
  stopped: number;
  /** Sem posição nova há mais de uma hora — rastreador mudo, não necessariamente caminhão parado. */
  silentOverAnHour: number;
  /** Fora da rota planejada, farol do rastreador. */
  offRoute: number;
  /** A leitura mais recente, para a tela dizer de quando é o retrato. */
  lastReceivedAt: string | null;
}

/**
 * Os quatro números do quadro da Torre de Controle (2026-08-20).
 *
 * SÃO CONTAGENS SOBRE O ÚLTIMO RETRATO, não sobre um período: a pergunta que este quadro responde é
 * "como está a frota agora?". Média e tendência são outra tela, e misturar as duas faria um número
 * que ninguém sabe interpretar quando ele muda.
 *
 * "Sem comunicar" é medido pelo instante da POSIÇÃO, não pelo da leitura. São coisas diferentes e
 * confundi-las inverte o diagnóstico: o robô pode estar lendo pontualmente a cada cinco minutos e o
 * rastreador de um caminhão estar mudo há oito dias — foi exatamente o que a tela do fornecedor
 * mostrou na primeira vez que a abri.
 */
export async function fleetSummary(): Promise<FleetSummary> {
  const linhas = await db
    .select({
      stoppedFlag: fleetPositions.stoppedFlag,
      offRoute: fleetPositions.offRoute,
      positionAt: fleetPositions.positionAt,
      receivedAt: fleetPositions.receivedAt,
    })
    .from(fleetPositions);

  const umaHoraAtras = Date.now() - 60 * 60 * 1000;
  const moving = linhas.filter((l) => (l.stoppedFlag ?? "").toUpperCase().startsWith("MOV")).length;

  return {
    total: linhas.length,
    moving,
    // O resto é "parado": inclui quem não informa movimento. Chamar de "parado" o que não se sabe é
    // deliberado — some do contador de andando, e some para menos é mais seguro do que para mais.
    stopped: linhas.length - moving,
    silentOverAnHour: linhas.filter((l) => !l.positionAt || l.positionAt.getTime() < umaHoraAtras)
      .length,
    offRoute: linhas.filter((l) => (l.offRoute ?? "").toUpperCase() === "S").length,
    lastReceivedAt:
      linhas.length === 0
        ? null
        : new Date(Math.max(...linhas.map((l) => l.receivedAt.getTime()))).toISOString(),
  };
}
