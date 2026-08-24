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

    /**
     * SEIS CAMPOS QUE JÁ VINHAM NA MESMA RESPOSTA (2026-08-24, a pedido).
     *
     * Escolhidos com a resposta real na mão, não pelo nome. Dos 380 campos, 159 vêm sempre nulos
     * para a frota inteira e a maior parte do resto é cadastro interno do rastreador — códigos,
     * apelidos de tela, flags de módulos não contratados. Guardar os 380 crus custaria ~250 MB por
     * dia de reescrita para carregar esse lixo junto.
     *
     * Dois candidatos foram DESCARTADOS na medição, e vale registrar por quê:
     * `OBSERVACOES_COLETA_ENTREGA` tem dois valores distintos em 67 registros (um deles é " / "),
     * ou seja, está vazio na prática; e `SMK_DATAHORACHEGADADESTINO` vem preenchido em 78 de 78,
     * inclusive para veículo SEM viagem — é sentinela, não chegada. O par honesto é a versão
     * `...FORMATADA`, preenchida exatamente nos mesmos 67 que têm saída da origem.
     */
    /**
     * O TELEFONE DO MOTORISTA, e ele chega por uma porta sem cota.
     *
     * O portal do cliente racionou dado pessoal na primeira carga do cadastro ("suas visitas para
     * dados confidenciais atingiram o limite máximo") — e o rastreador entrega telefone e nome do
     * mesmo motorista sem racionar nada, para 70 dos 78 veículos. São dois cadastros da mesma
     * pessoa, e este é o que a operação alcança quando precisa ligar AGORA.
     *
     * Texto, não número: 64 vêm como um celular e o resto traz dois números colados sem separador.
     * Normalizar aqui escolheria um deles e jogaria o outro fora; quem exibe decide.
     */
    driverPhone: text("driver_phone"),
    /** Cidade/UF do motorista, como o rastreador escreve ("ABAETE/MG"). */
    driverCity: text("driver_city"),
    /** Quilômetros rodados no dia, pelo hodômetro do rastreador. */
    kmToday: doublePrecision("km_today"),
    /**
     * Saída REAL da origem e chegada REAL no destino, medidas pelo rastreador.
     *
     * O TMS já tem a janela do cliente e a previsão calculada pela estrada; faltava o que de fato
     * aconteceu. É a diferença entre "devia sair às 8" e "saiu às 9h40" — e é dela que sai um atraso
     * de origem que não depende de ninguém apontar.
     *
     * Chegam sem fuso ("2026-08-24 09:40:12"), como todos os instantes deste fornecedor, e a
     * conversão mora na gravação pelo mesmo motivo dos outros: o relógio da VM do robô é a última
     * coisa em que confiar para alimentar cálculo de atraso.
     */
    departedOriginAt: timestamp("departed_origin_at", { withTimezone: true }),
    arrivedDestinationAt: timestamp("arrived_destination_at", { withTimezone: true }),
    /**
     * Minutos parado, contagem geral — diferente de `stopped_minutes`, que é parado DENTRO do alvo
     * (`MINUTOS_PARADO_ALVO_VIAGEM`). Os dois convivem porque respondem a perguntas diferentes:
     * "está parado há quanto tempo?" e "está parado no ponto de entrega há quanto tempo?".
     */
    stoppedMinutesTotal: integer("stopped_minutes_total"),

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
