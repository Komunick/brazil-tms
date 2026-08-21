import type { PortalLeg, PortalParseResult, PortalStop, PortalTrip } from "./portal-execution";

/**
 * The customer's portal, read straight from its own API instead of from a file somebody exported
 * (2026-08-16).
 *
 * The file path (`parsePortalExecution`) exists because a human clicks "Exportar" and uploads the
 * result. The API states the same trips — richer, actually — and a script on a logged-in machine can
 * ask for them every few minutes. What must NOT differ is what happens next: both paths produce the
 * same `PortalTrip[]`, so plan-apply, milestones, station resolution and the import history are one
 * implementation, tested once.
 *
 * The mapping is deliberately dumb, and lives HERE rather than in the browser script: a script on a
 * VM is hard to update and impossible to test, so it only fetches and forwards. Every judgement about
 * the payload is made in this file, under test.
 *
 * Shape (captured from the live portal, 2026-08-16 — the two listings return the SAME item):
 *   GET /api/line_haul/agency/trip/list?query_type=1&sta=<from>,<to>&pageno&count&agency_current_station_id
 *   GET /api/line_haul/agency/trip/history/list?mtime=<from>,<to>&pageno&count&agency_current_station_id
 *   → { retcode, message, data: { pageno, count, total, list: [ trip ] } }
 *
 * A trip carries `trip_number` (the LH id), `trip_status`, `vehicle_type_name`, `driver_name`,
 * `vehicle_number` and a `trip_station[]` of stops with `station_code`, `station_name` and the four
 * instants (`sta`/`std`/`ata`/`atd`) as epoch seconds, where 0 means "not yet".
 */

/** The envelope both listings answer with. Unknown/extra fields are ignored, never rejected. */
export interface PortalApiEnvelope {
  retcode?: number;
  message?: string;
  data?: {
    pageno?: number;
    count?: number;
    total?: number;
    list?: unknown[];
  };
}

/**
 * The portal's numeric trip status → the label the TMS config already speaks (`status_mappings`,
 * `closedStatusLabels`).
 *
 * The codes are NOT 1..n and were not guessed — they were measured against the live portal on
 * 2026-08-16, because reading one of them as "Cancelled" cancels real trips in the TMS:
 *
 *   4   (79 trips)  no driver, no departure, no arrival            → planned
 *   5   (21 trips)  driver on all 21, still no movement            → assigned
 *   90  (211 trips) 211/211 arrived at the FINAL stop, every stop
 *                   with an arrival time                            → completed
 *   100 (89 trips)  0/89 reached the final stop, though 43 had
 *                   departed and turned back                        → ended without delivering
 *
 * The 90/100 split is what makes the mapping safe: arrival at the last stop is present in every
 * single 90 and in no 100 at all.
 *
 * VOCABULÁRIO COMPLETO, LIDO DO PRÓPRIO PORTAL (2026-08-17)
 *
 * Os quatro acima vieram de inferência sobre os dados; o resto do vocabulário simplesmente não
 * existia para nós — sete rótulos viravam `Status 40`, `Status 50`, e por aí. Com autorização do
 * usuário, o filtro "Status da viagem" de cada aba foi aberto e cada opção medida pelo parâmetro que
 * o portal manda (`trip_station_status`). Nada de adivinhação: o número saiu da própria requisição.
 *
 * E o nome do parâmetro conta a coisa mais importante: é o status da ESTAÇÃO ATUAL da viagem, não da
 * viagem inteira. Por isso ele avança e recomeça a cada parada — e por isso o TMS continua tirando o
 * status da viagem dos MARCOS (horários reais), nunca deste rótulo.
 *
 * A escala é um ciclo de vida crescente dentro da parada:
 *
 *   4   Assigning   Planejado  — o cliente ainda está designando
 *   5   Assigned    Planejado  — já tem motorista, não saiu
 *   10  Loading     Aceito     — carregando
 *   30  Seal        Aceito     — lacrado
 *   40  Departed    Aceito     — partiu
 *   50  Arrived     Aceito     — chegou na parada seguinte
 *   60  Unseal      Aceito     — lacre aberto
 *   70  Operating   Aceito     — descarregando
 *   80  Unloaded    Aceito     — descarregado
 *   90  Completed   Concluído  — encerrada
 *   100 Cancelled   Concluído  — cancelada
 *
 * O 20 existe no portal (a viagem passa por "Em fila"/"Acoplado" antes de carregar) e NÃO é oferecido
 * como filtro, então não foi medido — fica de fora em vez de entrar por palpite.
 *
 * Um código desconhecido continua passando como `Status <n>`: ele não casa com nenhum
 * `closedStatusLabels`, então um código que nunca vimos pode criar ou atualizar uma viagem, mas nunca
 * encerrar nem cancelar uma. É essa regra que deixa a tabela incompleta ser segura.
 */
/**
 * O SEGUNDO eixo: o cliente já aceitou esta viagem? (2026-08-17)
 *
 * `trip_status` diz se há motorista; `acceptance_status` diz se a proposta foi aceita. São
 * independentes, e é o cruzamento deles que descreve a operação de verdade — medido no portal:
 *
 *   Pending  + Assigning  →  44 viagens  →  alguém precisa ACEITAR ou REJEITAR
 *   Accepted + Assigning  → 359 viagens  →  aceitas, esperando ATRIBUIR motorista
 *   Accepted + Assigned   →  43 viagens  →  já atribuídas
 *
 * Sem este campo as 403 primeiras eram uma pilha só de "Recebida" no TMS, e a fila de 359 que precisa
 * de despacho era invisível. Os códigos vieram do filtro "Status de aceitação", medidos pelo
 * parâmetro que o portal manda — não são palpite.
 *
 * `Accepted(Pending Award)` existe na lista do portal e hoje não tem nenhuma viagem, então o código
 * dele não foi medido: fica de fora, e um código desconhecido passa como `Aceitação <n>` em vez de
 * virar um rótulo inventado.
 */
const ACCEPTANCE_LABEL: Record<number, string> = {
  0: "Pending",
  1: "Accepted",
};

const TRIP_STATUS_LABEL: Record<number, string> = {
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
};

const trimmed = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" || text === "-" ? null : text;
};

const positive = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

/**
 * The station cell the rest of the pipeline expects — `"[8300]SoC_RJ_Duque de Caxias"`. The API hands
 * the id and the name apart, so the pair is rebuilt in that shape rather than teaching every consumer
 * a second format. `station_code` is the OPERATIONAL code and is NOT the id the TMS reconciles by
 * (`locations.external_station_id`); `station` is.
 */
function stationValue(stationId: string | null, stationName: string | null): string {
  if (stationId && stationName) return `[${stationId}]${stationName}`;
  return stationName ?? (stationId ? `[${stationId}]` : "");
}

function toStop(raw: Record<string, unknown>, index: number): PortalStop {
  const stationId = positive(raw.station) != null ? String(raw.station) : null;
  const stationName = trimmed(raw.station_name);
  return {
    sequence: typeof raw.sequence_number === "number" ? raw.sequence_number : index + 1,
    stationValue: stationValue(stationId, stationName),
    stationId,
    stationName: stationName ?? "",
    plannedArrival: positive(raw.sta),
    plannedDeparture: positive(raw.std),
    actualArrival: positive(raw.ata),
    actualDeparture: positive(raw.atd),
    // The loading and unloading steps. The API times them per stop; the spreadsheet export has no
    // such columns, which is why `loading`/`loaded`/`unloading`/`unloaded` sat unused in the status
    // machine until now — a trip arrived at its destination and stayed there for good.
    loadingStarted: positive(raw.loading_time),
    loadedAt: positive(raw.loaded_time),
    unsealedAt: positive(raw.unseal_time),
    unloadedAt: positive(raw.unloaded_time),
  };
}

/**
 * One API payload → the canonical trips. A trip with fewer than two stops states no movement and is
 * rejected with its reason (same rule as the file path: a leg needs an origin AND a destination).
 */
export function mapPortalApiTrips(payload: PortalApiEnvelope): PortalParseResult {
  const trips: PortalTrip[] = [];
  const rejected: PortalParseResult["rejected"] = [];

  const list = Array.isArray(payload?.data?.list) ? payload.data!.list! : [];

  list.forEach((entry, index) => {
    const raw = (entry ?? {}) as Record<string, unknown>;
    const externalTripId = trimmed(raw.trip_number);
    if (!externalTripId) {
      rejected.push({ row: index + 1, externalTripId: "", reason: "Viagem sem número (LH)." });
      return;
    }

    const stopsRaw = Array.isArray(raw.trip_station) ? (raw.trip_station as unknown[]) : [];
    const stops = stopsRaw
      .map((s, i) => toStop((s ?? {}) as Record<string, unknown>, i))
      .filter((s) => s.stationValue !== "")
      .sort((a, b) => a.sequence - b.sequence);

    if (stops.length < 2) {
      rejected.push({
        row: index + 1,
        externalTripId,
        reason: "Viagem com menos de duas paradas: nenhum movimento a registrar.",
      });
      return;
    }

    const legs: PortalLeg[] = [];
    for (let i = 0; i + 1 < stops.length; i += 1) {
      legs.push({ legNumber: i + 1, origin: stops[i]!, destination: stops[i + 1]! });
    }

    const statusCode = typeof raw.trip_status === "number" ? raw.trip_status : null;
    trips.push({
      externalTripId,
      // O inteiro com que o portal se endereça. Ver `PortalTrip.portalTripId` para o porquê de
      // guardá-lo: é a chave de toda ação escrita, e ela vem de graça em toda listagem.
      portalTripId: positive(raw.id) != null ? String(raw.id) : null,
      tripName: trimmed(raw.trip_name),
      status: statusCode == null ? null : (TRIP_STATUS_LABEL[statusCode] ?? `Status ${statusCode}`),
      driverLabel: trimmed(raw.driver_name),
      /**
       * O id do motorista NO SISTEMA DO CLIENTE (2026-08-17).
       *
       * O portal manda `driver: 181446` junto do nome, e a gente vinha jogando fora — ficávamos
       * casando a frota por NOME, que é frágil por natureza: um acento fora do lugar já custou 3
       * motoristas que existiam e o TMS jurava não existirem.
       *
       * Guardar o id não conserta o casamento sozinho (a frota do TMS ainda não carrega esse
       * número), mas é a única chave que os dois lados compartilham. Sem ela, qualquer casamento
       * exato no futuro seria impossível — e jogar fora um dado que o cliente entrega de graça é o
       * tipo de perda que só aparece quando já é tarde.
       */
      driverExternalId: positive(raw.driver) != null ? String(raw.driver) : null,
      // 0 é um valor VÁLIDO aqui (Pending), então não dá para usar `positive`: o zero é justamente a
      // fila que precisa de gente.
      acceptanceStatus:
        typeof raw.acceptance_status === "number"
          ? (ACCEPTANCE_LABEL[raw.acceptance_status] ?? `Aceitação ${raw.acceptance_status}`)
          : null,
      operatorLabel: trimmed(raw.operator),
      priceCents: portalPriceCents(raw.cost_unit),
      vehicleLabel: trimmed(raw.vehicle_type_name),
      plateLabel: trimmed(raw.vehicle_number),
      stops,
      legs,
    });
  });

  return { trips, rejected };
}

/**
 * The trip DETAIL payload — a second endpoint, one call per trip.
 *
 * It carries what the listings do not: `assign_operator`, the person who put a driver on this trip
 * (an e-mail, per stop). Fetching it for every trip on every cycle would be ~500 calls; the TMS
 * therefore names the few trips still missing it and the robot asks only for those.
 *
 *   GET /api/line_haul/agency/trip/detail?trip_id=<id>&agency_current_station_id=<station>
 *   → { retcode, message, data: { trip_number, trip_station: [ { assign_operator, … } ] } }
 */
export interface PortalApiDetail {
  externalTripId: string;
  /** Who assigned the driver, per the portal. Null when it does not say. */
  assignOperator: string | null;
}

export function mapPortalApiDetail(payload: {
  retcode?: number;
  data?: Record<string, unknown>;
}): PortalApiDetail | null {
  const d = payload?.data ?? {};
  const externalTripId = trimmed(d.trip_number);
  if (!externalTripId) return null;

  // Per stop, and the origin is the one that matters — that is where the assignment happens. Falls
  // back to the first stop that names anyone, rather than reporting nothing over an ordering detail.
  const stops = Array.isArray(d.trip_station) ? (d.trip_station as Record<string, unknown>[]) : [];
  const assignOperator =
    stops.map((s) => trimmed(s?.assign_operator)).find((v) => v != null) ?? null;

  return { externalTripId, assignOperator };
}

/**
 * "Valor da Viagem" → centavos. É o que a Brazil Transports recebe por aquela viagem (confirmado
 * com o cliente em 2026-08-16), publicado pelo portal como texto com centavos ("2471.53").
 *
 * Só existe enquanto a viagem está no Planejado: das concluídas, 2 em 50 ainda o traziam. Por isso
 * é lido no ciclo do plano — esperar a viagem terminar é perder o número.
 */
export function portalPriceCents(value: unknown): number | null {
  if (typeof value === "number")
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
  const text = trimmed(value);
  if (!text) return null;
  const parsed = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : null;
}
