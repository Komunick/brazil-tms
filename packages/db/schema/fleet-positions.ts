import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { vehicles } from "./vehicles";

/**
 * ONDE O CAMINHÃO ESTÁ AGORA, segundo o rastreador (2026-08-20).
 *
 * O TMS sabia o que o CLIENTE diz da viagem e não sabia nada do veículo. Esta tabela é a terceira
 * fonte: o eTorre (white-label da Raster), que a operação já usa e que calcula coisas que o TMS não
 * tem como calcular — posição, percentual percorrido e uma previsão de chegada baseada na estrada,
 * não no relógio.
 *
 * ── UMA LINHA POR PLACA, NÃO UM HISTÓRICO ──────────────────────────────────────────────────────
 *
 * É o ÚLTIMO estado de cada veículo, sobrescrito a cada leitura. Guardar a trilha seriam ~28 mil
 * linhas por dia (98 veículos a cada cinco minutos) para responder "por onde ele passou?", que é
 * pergunta que ninguém faz nesta tela — e que o rastreador já responde melhor, com o mapa e o
 * histórico dele. O que o TMS precisa é do agora, ao lado da viagem.
 *
 * ── A PLACA É A CHAVE, E O VÍNCULO É OPCIONAL ──────────────────────────────────────────────────
 *
 * `plate` guarda a placa normalizada (maiúscula, sem hífen) e é única: é ela que o rastreador
 * conhece. `vehicle_id` aponta para a frota cadastrada QUANDO existe correspondência — e não impede
 * a gravação quando não existe. Um caminhão que o rastreador vê e o TMS não cadastrou é justamente
 * o que se quer enxergar; recusar a linha esconderia o problema em vez de mostrá-lo.
 *
 * ── OS TEXTOS SÃO OS DO RASTREADOR ─────────────────────────────────────────────────────────────
 *
 * `trip_status`, cidades e a referência de posição vêm como ele escreve ("INICIADA", "GUANAMBI/BA",
 * "0.41 km de VIP ESTACIONAMENTO"). O TMS não reinterpreta: são para leitura humana, ao lado do
 * status que o TMS mantém por conta própria. Traduzir criaria um segundo vocabulário para a mesma
 * coisa, e a divergência entre os dois é informação — não ruído a ser normalizado.
 */
export const fleetPositions = pgTable(
  "fleet_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Placa do cavalo, normalizada (maiúscula, sem separador). A chave do rastreador. */
    plate: text("plate").notNull(),
    /** A frota cadastrada, quando a placa casa. Nulo é um caminhão que o TMS não conhece. */
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    /** Placa da carreta, como o rastreador informa. */
    trailerPlate: text("trailer_plate"),
    /** O motorista SEGUNDO O RASTREADOR — não é a atribuição do TMS, e comparar os dois é o ponto. */
    driverLabel: text("driver_label"),

    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    /** Referência textual da última posição ("0.41 km de POSTO TREVO 03 - PORTO NACIONAL/TO"). */
    positionLabel: text("position_label"),
    /** Instante da última posição, em UTC. É por ele que se mede "há quanto tempo não comunica". */
    positionAt: timestamp("position_at", { withTimezone: true }),
    /** Ignição, como o rastreador reporta ("L" ligada, "D" desligada). */
    ignition: text("ignition"),

    /** "INICIADA", "EM ABERTO", "SEM VIAGEM" — o vocabulário do rastreador. */
    tripStatus: text("trip_status"),
    originCity: text("origin_city"),
    destinationCity: text("destination_city"),
    tripStartedAt: timestamp("trip_started_at", { withTimezone: true }),
    /**
     * A PREVISÃO DE CHEGADA calculada pelo rastreador, em UTC.
     *
     * É o campo que justifica a integração inteira: o risco de SLA do TMS é medido pelo relógio
     * contra a janela planejada, sem saber se o caminhão está a 40 km ou a 1.000 km do destino.
     * Cruzada com a janela que o cliente publica, esta hora responde "vai chegar a tempo?".
     */
    etaAt: timestamp("eta_at", { withTimezone: true }),
    /** Percentual da viagem já percorrido, como o rastreador calcula (0–100). */
    progressPercent: doublePrecision("progress_percent"),
    kmTravelled: doublePrecision("km_travelled"),
    stoppedMinutes: integer("stopped_minutes"),

    /**
     * OS FARÓIS DO RASTREADOR — os oito ícones da tela do fornecedor.
     *
     * Guardados CRUS, no vocabulário dele (`S`/`N`, `MAI`/`MEN`, `MAI`/`MOV`). A tradução para
     * "aceso/apagado" mora em `shared/domain/fleet-alerts.ts`, num lugar só: se ele trocar um
     * código, muda uma função — e não uma migração de dados sobre histórico já gravado.
     *
     * `no_position` é a exceção que prova a regra: vem `"S"` para a frota inteira porque é a
     * CONFIGURAÇÃO do alerta, não o estado. O alfinete de posição é derivado do instante da última
     * posição contra `no_position_limit_minutes`. A coluna fica porque é o que o fornecedor manda.
     */
    offRoute: text("off_route"),
    noPosition: text("no_position"),
    stoppedFlag: text("stopped_flag"),
    /** Jornada do motorista: `MAI` passou das quatro horas permitidas, `MEN` está dentro. */
    drivingTimeFlag: text("driving_time_flag"),
    /** `S` quando a viagem começou depois da hora prevista. */
    lateStartFlag: text("late_start_flag"),
    blockedFlag: text("blocked_flag"),
    sirenFlag: text("siren_flag"),
    /** A liberação vigente, texto do rastreador. Existir já é o alerta. */
    releaseLabel: text("release_label"),
    /** `S` quando o próprio rastreador considera a viagem atrasada — a régua dele, não a nossa. */
    tripDelayFlag: text("trip_delay_flag"),
    /** Minutos de silêncio que o rastreador considera demais nesta conta (hoje 60). */
    noPositionLimitMinutes: integer("no_position_limit_minutes"),

    /** Quando o TMS gravou esta leitura. É o relógio de "o robô ainda está vivo?". */
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Uma linha por veículo: a gravação é upsert por placa. Sem esta chave, cada ciclo do robô
    // acrescentaria 98 linhas e a tabela viraria o histórico que ela não quer ser.
    uniqueIndex("fleet_positions_plate_uq").on(table.plate),
    index("fleet_positions_vehicle_idx").on(table.vehicleId),
    index("fleet_positions_received_idx").on(table.receivedAt.desc()),
  ],
);
