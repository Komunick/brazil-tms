import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { ACTIVE_TRIP_STATUSES, APP_TIME_ZONE, type FleetPositionInput } from "@brazil-tms/shared";
import { db } from "../client";
import { drivers, fleetPositions, tripAssignments, trips, vehicles } from "../../schema";
import { foldNameSql } from "../trips/portal-fleet-link";

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
  drivingTimeFlag: string | null;
  lateStartFlag: string | null;
  blockedFlag: string | null;
  sirenFlag: string | null;
  releaseLabel: string | null;
  tripDelayFlag: string | null;
  noPositionLimitMinutes: number | null;
  receivedAt: string;
  /** A viagem do TMS que está com este veículo agora, quando existe. */
  tripId: string | null;
  externalTripId: string | null;
  /** O fim da janela que o CLIENTE publicou — a promessa contra a qual o risco é medido. */
  deliveryWindowEnd: string | null;
  risk: DeliveryRisk;
}

export interface FleetFeedResult {
  /** Quantas linhas o lote trouxe, depois de descartar placa vazia. */
  recebidas: number;
  /** Quantas casaram com um veículo cadastrado. */
  vinculadas: number;
  /** As placas que o rastreador vê e o TMS não tem cadastradas. */
  semCadastro: string[];
  /** Quantos motoristas ganharam telefone nesta leitura — ver `preencherTelefonesDaFrota`. */
  telefonesPreenchidos: number;
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
  if (linhas.length === 0)
    return { recebidas: 0, vinculadas: 0, semCadastro: [], telefonesPreenchidos: 0 };

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
    drivingTimeFlag: texto(e.drivingTimeFlag),
    lateStartFlag: texto(e.lateStartFlag),
    blockedFlag: texto(e.blockedFlag),
    sirenFlag: texto(e.sirenFlag),
    releaseLabel: texto(e.releaseLabel),
    tripDelayFlag: texto(e.tripDelayFlag),
    noPositionLimitMinutes: paraInteiro(e.noPositionLimitMinutes),
    driverPhone: texto(e.driverPhone),
    driverCity: texto(e.driverCity),
    kmToday: semSentinela(e.kmToday),
    // Sem fuso, como os outros instantes deste fornecedor — `paraUtc` aplica o fuso da empresa.
    departedOriginAt: paraUtc(e.departedOriginAt),
    arrivedDestinationAt: paraUtc(e.arrivedDestinationAt),
    stoppedMinutesTotal: paraInteiro(e.stoppedMinutesTotal),
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
        drivingTimeFlag: sql`excluded.driving_time_flag`,
        lateStartFlag: sql`excluded.late_start_flag`,
        blockedFlag: sql`excluded.blocked_flag`,
        sirenFlag: sql`excluded.siren_flag`,
        releaseLabel: sql`excluded.release_label`,
        tripDelayFlag: sql`excluded.trip_delay_flag`,
        noPositionLimitMinutes: sql`excluded.no_position_limit_minutes`,
        driverPhone: sql`excluded.driver_phone`,
        driverCity: sql`excluded.driver_city`,
        kmToday: sql`excluded.km_today`,
        departedOriginAt: sql`excluded.departed_origin_at`,
        arrivedDestinationAt: sql`excluded.arrived_destination_at`,
        stoppedMinutesTotal: sql`excluded.stopped_minutes_total`,
        receivedAt: sql`excluded.received_at`,
      },
    });

  return {
    recebidas: valores.length,
    vinculadas: valores.filter((v) => v.vehicleId !== null).length,
    semCadastro: valores.filter((v) => v.vehicleId === null).map((v) => v.plate),
    telefonesPreenchidos: await preencherTelefonesDaFrota(),
  };
}

/**
 * O TELEFONE DO MOTORISTA QUE O RASTREADOR SABE E O CADASTRO NÃO (2026-08-24, a pedido).
 *
 * ── POR QUE UMA SEGUNDA FONTE ─────────────────────────────────────────────────────────────────
 *
 * O portal do cliente é a fonte natural do cadastro, e ele foi perguntado: dos 858 motoristas sem
 * telefone, respondeu VAZIO para todos — não é cota, é ausência, e o robô do cadastro já registrou
 * isso para não repetir a pergunta. O rastreador, que não raciona nada, traz telefone E nome de 70
 * motoristas a cada cinco minutos.
 *
 * O ganho parece pequeno visto como cadastro — 12 dos 858. Visto como OPERAÇÃO, é outro número: dos
 * 90 motoristas em viagem agora, 13 não têm contato no TMS e este preenchimento resolve 8. É a
 * diferença entre "o cadastro está 40% completo" e "não dá para ligar para o caminhão que está na
 * estrada". E se renova sozinho: quem entra em viagem amanhã chega com telefone.
 *
 * ── SÓ PREENCHE VAZIO ─────────────────────────────────────────────────────────────────────────
 *
 * Nunca sobrescreve. Se alguém digitou um número à mão, ou se o portal já entregou o dele, essa
 * versão fica — a mesma regra que o espelho do cadastro segue, e pela mesma razão: correção humana
 * vale mais que dado de robô.
 *
 * ── O CASAMENTO É POR NOME, ENTÃO A AMBIGUIDADE É RECUSADA ────────────────────────────────────
 *
 * Nome é chave frágil, e aqui o erro tem cara feia: telefone da pessoa errada no cadastro de outra,
 * silenciosamente. Duas guardas, e as duas recusam em vez de escolher:
 *
 *   1. o nome tem de casar com UM único motorista não arquivado — homônimo é pulado;
 *   2. o rastreador tem de dizer UM único telefone para aquele nome — se dois veículos discordam
 *      sobre o número da mesma pessoa, ninguém decide por eles.
 *
 * O dobramento é o MESMO de `portal-fleet-link` (sem acento, espaço colapsado, maiúsculo), e vem de
 * lá importado em vez de recopiado: duas cópias divergem no dia em que alguém corrigir uma.
 *
 * ── TEXTO, NÃO NÚMERO ─────────────────────────────────────────────────────────────────────────
 *
 * Seis dos setenta trazem dois números colados sem separador. Normalizar aqui escolheria um e
 * jogaria o outro fora; quem liga prefere ver os dois.
 */
export async function preencherTelefonesDaFrota(): Promise<number> {
  const atualizados = await db.execute<{ id: string }>(sql`
    WITH doRastreador AS (
      SELECT ${foldNameSql(sql`${fleetPositions.driverLabel}`)} AS nome,
             min(btrim(${fleetPositions.driverPhone})) AS telefone
        FROM ${fleetPositions}
       WHERE btrim(coalesce(${fleetPositions.driverPhone}, '')) <> ''
         AND btrim(coalesce(${fleetPositions.driverLabel}, '')) <> ''
       GROUP BY 1
      HAVING count(DISTINCT btrim(${fleetPositions.driverPhone})) = 1
    )
    UPDATE ${drivers} d
       SET phone = r.telefone, updated_at = now()
      FROM doRastreador r
     WHERE ${foldNameSql(sql`d.name`)} = r.nome
       AND d.archived_at IS NULL
       AND btrim(coalesce(d.phone, '')) = ''
       AND (SELECT count(*) FROM ${drivers} d2
             WHERE ${foldNameSql(sql`d2.name`)} = r.nome AND d2.archived_at IS NULL) = 1
    RETURNING d.id
  `);
  const linhas = Array.isArray(atualizados)
    ? atualizados
    : ((atualizados as { rows?: unknown[] }).rows ?? []);
  return linhas.length;
}

/**
 * O retrato inteiro, JÁ CRUZADO com a viagem que está com cada veículo.
 *
 * O cruzamento passa pela atribuição vigente (`is_current`) e só considera viagem ATIVA: um veículo
 * que rodou ontem e está livre hoje não pode herdar a janela da viagem encerrada e aparecer atrasado
 * para sempre.
 *
 * Uma consulta para todas as atribuições, não uma por veículo. São ~85 posições; perguntar uma a uma
 * seriam 85 idas ao banco a cada carregamento de tela.
 */
export async function readFleetPositions(): Promise<FleetPositionView[]> {
  /**
   * DO MAIOR PROGRESSO PARA O MENOR (2026-08-21, a pedido).
   *
   * A ordem era por hora de leitura, que é a ordem em que o rastreador respondeu — informação sobre
   * o robô, não sobre a operação. Quem abre esta tela quer saber quem está chegando, e isso se lê de
   * cima para baixo quando o mais adiantado vem primeiro.
   *
   * `NULLS LAST` porque nulo aqui é "sem viagem para medir", não "progresso zero": caminhão parado
   * sem viagem no topo da lista empurraria para baixo justamente quem está em movimento.
   *
   * A hora de leitura fica como critério de desempate — entre dois veículos no mesmo percentual,
   * o de posição mais fresca primeiro.
   */
  const linhas = await db
    .select()
    .from(fleetPositions)
    .orderBy(
      sql`${fleetPositions.progressPercent} desc nulls last`,
      desc(fleetPositions.receivedAt),
    );
  const veiculos = linhas.map((l) => l.vehicleId).filter((v): v is string => v !== null);

  const viagens = veiculos.length
    ? await db
        .select({
          vehicleId: tripAssignments.vehicleId,
          tripId: trips.id,
          externalTripId: trips.externalTripId,
          deliveryWindowEnd: trips.plannedDeliveryWindowEnd,
        })
        .from(tripAssignments)
        .innerJoin(trips, eq(trips.id, tripAssignments.tripId))
        .where(
          and(
            eq(tripAssignments.isCurrent, true),
            inArray(tripAssignments.vehicleId, veiculos),
            inArray(trips.currentStatus, [...ACTIVE_TRIP_STATUSES]),
          ),
        )
    : [];
  /**
   * QUAL DAS VIAGENS ATIVAS É A QUE ESTÁ EM JOGO (corrigido em 2026-08-20, horas depois de nascer).
   *
   * A primeira versão ficava com a janela MAIS PRÓXIMA, raciocinando sobre milk run: duas pernas da
   * mesma jornada, e a mais próxima é a que corre agora. O dado real desmentiu na primeira medição —
   * o `ATG9I07` tem OITO viagens ativas simultâneas no TMS, com janelas de 19 a 22/08. Com "a mais
   * próxima" ele herdava a de 19/08, vencida havia 35 horas, e nascia atrasado por definição. Foi o
   * que produziu 31 "atrasadas" com janela vencida há mais de um dia.
   *
   * Passa a valer a PRIMEIRA JANELA QUE AINDA NÃO VENCEU: é a promessa que ainda dá para cumprir, e
   * portanto a única sobre a qual faz sentido avisar. Prazo já furado é assunto do SLA, que já o
   * acompanha — repeti-lo aqui afogaria o aviso que importa.
   *
   * Quando TODAS já venceram, fica a MAIS RECENTE: o caminhão está mesmo atrasado, e a janela menos
   * velha descreve o atraso de agora em vez do acumulado de dias.
   */
  const agora = Date.now();
  const porVeiculo = new Map<string, (typeof viagens)[number]>();
  for (const v of viagens) {
    if (!v.vehicleId) continue;
    const atual = porVeiculo.get(v.vehicleId);
    if (!atual || melhorJanela(v.deliveryWindowEnd, atual.deliveryWindowEnd, agora)) {
      porVeiculo.set(v.vehicleId, v);
    }
  }

  return linhas.map((r) => {
    const viagem = r.vehicleId ? porVeiculo.get(r.vehicleId) : undefined;
    return {
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
      drivingTimeFlag: r.drivingTimeFlag,
      lateStartFlag: r.lateStartFlag,
      blockedFlag: r.blockedFlag,
      sirenFlag: r.sirenFlag,
      releaseLabel: r.releaseLabel,
      tripDelayFlag: r.tripDelayFlag,
      noPositionLimitMinutes: r.noPositionLimitMinutes,
      receivedAt: r.receivedAt.toISOString(),
      tripId: viagem?.tripId ?? null,
      externalTripId: viagem?.externalTripId ?? null,
      deliveryWindowEnd: viagem?.deliveryWindowEnd?.toISOString() ?? null,
      risk: classifyRisk(r.etaAt, viagem?.deliveryWindowEnd ?? null),
    };
  });
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
  /**
   * OS DOIS RISCOS, SEPARADOS (2026-08-20, a pedido).
   *
   * Nasceram somados num contador só, e o usuário viu o problema antes de mim: são ações diferentes.
   * `late` já aconteceu — cabe avisar o cliente e registrar o motivo. `willBeLate` ainda dá para
   * evitar — cabe ligar para o motorista. Um número só esconde qual das duas a sala precisa fazer,
   * e é assim que o próprio rastreador separa na legenda dele.
   */
  late: number;
  willBeLate: number;
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
  /**
   * O resumo lê o MESMO retrato cruzado que a página, e não uma consulta própria.
   *
   * São ~85 linhas: o custo de reaproveitar é irrelevante, e o ganho é que o número do quadro e a
   * lista que ele abre nunca podem discordar. Duas consultas para a mesma pergunta foi exatamente o
   * que produziu o cartão "NA ORIGEM" anunciando 2 e abrindo vazio.
   */
  const linhas = await readFleetPositions();

  const umaHoraAtras = Date.now() - 60 * 60 * 1000;
  const moving = linhas.filter((l) => (l.stoppedFlag ?? "").toUpperCase().startsWith("MOV")).length;

  return {
    total: linhas.length,
    moving,
    // O resto é "parado": inclui quem não informa movimento. Chamar de "parado" o que não se sabe é
    // deliberado — some do contador de andando, e some para menos é mais seguro do que para mais.
    stopped: linhas.length - moving,
    silentOverAnHour: linhas.filter(
      (l) => !l.positionAt || new Date(l.positionAt).getTime() < umaHoraAtras,
    ).length,
    offRoute: linhas.filter((l) => (l.offRoute ?? "").toUpperCase() === "S").length,
    late: linhas.filter((l) => l.risk === "atrasada").length,
    willBeLate: linhas.filter((l) => l.risk === "vai_atrasar").length,
    lastReceivedAt:
      linhas.length === 0
        ? null
        : new Date(Math.max(...linhas.map((l) => new Date(l.receivedAt).getTime()))).toISOString(),
  };
}

/**
 * O RISCO DE FURAR A JANELA DO CLIENTE (2026-08-20).
 *
 * `atrasada`   — a chegada calculada já passou do fim da janela prometida.
 * `vai_atrasar`— ainda cabe, mas a margem encolheu abaixo de `MARGEM_MINUTOS`.
 * `no_prazo`   — sobra folga.
 * `sem_base`   — falta a previsão do rastreador, a janela do cliente, ou o vínculo entre os dois.
 *
 * `sem_base` é uma resposta de primeira classe, não um resto. Ela diz "não sei", que é diferente de
 * "está tudo bem" — e é o que impede a tela de pintar de verde um caminhão sobre o qual não há
 * informação nenhuma.
 */
export type DeliveryRisk = "no_prazo" | "vai_atrasar" | "atrasada" | "sem_base";

/**
 * Entre duas janelas do mesmo veículo, qual descreve o compromisso de agora.
 *
 * Ganha a primeira que AINDA NÃO VENCEU (a mais próxima entre as futuras). Se nenhuma sobrou, ganha
 * a menos velha. Janela ausente perde para qualquer janela: com ela não há promessa a medir.
 *
 * Devolve verdadeiro quando a candidata deve substituir a atual.
 */
export function melhorJanela(candidata: Date | null, atual: Date | null, agora: number): boolean {
  if (!candidata) return false;
  if (!atual) return true;
  const candidataVale = candidata.getTime() >= agora;
  const atualVale = atual.getTime() >= agora;
  if (candidataVale !== atualVale) return candidataVale;
  // Ambas no futuro: a mais próxima é a que corre agora. Ambas vencidas: a menos velha.
  return candidataVale ? candidata < atual : candidata > atual;
}

/**
 * Quanta folga ainda conta como tranquilo.
 *
 * Uma hora, e é um número ESCOLHIDO, não medido — não há histórico para calibrá-lo ainda. Ele está
 * aqui, com nome, para poder ser discutido e mudado quando houver: um limiar enterrado numa
 * comparação é um limiar que ninguém revisa.
 *
 * O rastreador tem o alerta equivalente e nós deliberadamente NÃO o copiamos: o dele mede contra o
 * prazo que ELE conhece, com uma regra que não controlamos e que pode mudar sem aviso. Este mede
 * contra a janela que o cliente publicou, que é o compromisso pelo qual a empresa responde.
 */
export const MARGEM_MINUTOS = 60;

export function classifyRisk(eta: Date | null, janelaFim: Date | null): DeliveryRisk {
  if (!eta || !janelaFim) return "sem_base";
  const margem = (janelaFim.getTime() - eta.getTime()) / 60000;
  if (margem < 0) return "atrasada";
  return margem < MARGEM_MINUTOS ? "vai_atrasar" : "no_prazo";
}
