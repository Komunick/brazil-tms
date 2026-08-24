import { and, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { userWatchedTrips } from "../../schema";

/**
 * MINHA PROGRAMAÇÃO — a lista pessoal, com o que é preciso para agir sobre ela (2026-08-23).
 *
 * A linha traz o que a pessoa procura quando abre a lista: qual LH, para onde vai, quando é a
 * coleta, em que pé está, QUEM está dirigindo, com que placa e QUAL O TELEFONE.
 *
 * ── O TELEFONE VEM DO NOSSO CADASTRO, CASADO PELO NOME ─────────────────────────────────────────
 *
 * O portal manda o nome do motorista e o id DELE, não o nosso; o telefone está no cadastro de
 * motoristas do TMS. A única chave que os dois lados compartilham é o nome, e casar por nome é
 * frágil por natureza — um acento fora do lugar já custou três motoristas que existiam e o sistema
 * jurava não existirem.
 *
 * Medido antes de escrever (2026-08-23): das 110 viagens ativas com motorista, 107 casam com o
 * cadastro e 97 têm telefone. Onde não casa, a tela mostra o nome e diz que não tem contato — em
 * vez de esconder a viagem ou inventar um número.
 *
 * `upper(trim(...))` dos dois lados porque o portal manda em caixa alta e o cadastro não.
 *
 * ── A PLACA VEM DO PORTAL, NÃO DA NOSSA ATRIBUIÇÃO ─────────────────────────────────────────────
 *
 * É o que o CLIENTE enxerga, e é o que o motorista vai apresentar na estação. A atribuição do TMS
 * pode divergir — e quando diverge, quem manda na portaria é a do portal.
 */
export interface ViagemAcompanhada {
  tripId: string;
  externalTripId: string | null;
  origem: string | null;
  destino: string | null;
  /** O STA: a hora em que o motorista tem de estar na origem. */
  coleta: string | null;
  status: string;
  acceptanceStatus: string | null;
  portalStatus: string | null;
  motorista: string | null;
  placa: string | null;
  /** Telefone do cadastro, quando o nome casa. `null` = não achamos, e a tela diz isso. */
  telefone: string | null;
}

export async function readMinhaProgramacao(userId: string): Promise<ViagemAcompanhada[]> {
  const linhas = await db.execute<{
    trip_id: string;
    external_trip_id: string | null;
    origem: string | null;
    destino: string | null;
    coleta: string | null;
    status: string;
    aceitacao: string | null;
    status_portal: string | null;
    motorista: string | null;
    placa: string | null;
    telefone: string | null;
  }>(sql`
    select
      t.id as trip_id,
      t.external_trip_id,
      lo.name as origem,
      ld.name as destino,
      to_char(t.planned_pickup_window_start at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as coleta,
      t.current_status::text as status,
      t.customer_fields ->> 'Aceitação (portal)' as aceitacao,
      t.customer_fields ->> 'Status (portal)' as status_portal,
      t.customer_fields ->> 'Motorista (portal)' as motorista,
      t.customer_fields ->> 'Placa (portal)' as placa,
      (
        select d.phone from drivers d
        where upper(trim(d.name)) = upper(trim(t.customer_fields ->> 'Motorista (portal)'))
          and d.phone is not null and d.archived_at is null
        limit 1
      ) as telefone
    from ${userWatchedTrips} w
    join trips t on t.id = w.trip_id
    left join locations lo on lo.id = t.origin_location_id
    left join locations ld on ld.id = t.destination_location_id
    where w.user_id = ${userId}
    order by w.created_at
  `);

  return linhas.map((r) => ({
    tripId: r.trip_id,
    externalTripId: r.external_trip_id,
    origem: r.origem,
    destino: r.destino,
    coleta: r.coleta,
    status: r.status,
    acceptanceStatus: r.aceitacao,
    portalStatus: r.status_portal,
    motorista: r.motorista,
    placa: r.placa,
    telefone: r.telefone,
  }));
}

/** Entrar na lista é idempotente: clicar duas vezes não duplica nem dá erro na cara de ninguém. */
/**
 * O QUADRO DA PROGRAMAÇÃO — o que substitui a planilha (2026-08-24, a pedido).
 *
 * ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────────────────────────
 *
 * A operação programa numa planilha do Google com 12.317 linhas — uma por LH, colorida à mão, com
 * motorista, cavalo, carreta, CPF e telefone repetidos ao lado de cada viagem. Tudo isso o TMS já
 * sabe: o que faltava era mostrar do jeito que se trabalha, que é POR DIA e com o dia de ontem
 * ainda à vista.
 *
 * ── ONTEM ENTRA, E É O PONTO MAIS FÁCIL DE ERRAR ──────────────────────────────────────────────
 *
 * Uma programação que começa em "hoje" perde a viagem que saiu ontem à noite e ainda está na
 * estrada — que é justamente a que alguém precisa acompanhar de manhã. A janela vai de ontem em
 * diante, e cada linha diz a que dia pertence.
 *
 * ── O DIA É O DA COLETA, EM SÃO PAULO ─────────────────────────────────────────────────────────
 *
 * `planned_pickup_window_start` convertido para o fuso da empresa ANTES de virar data. Sem a
 * conversão, tudo o que sai depois das 21h cairia no dia seguinte — e a programação da noite, que é
 * quando a operação mais roda, apareceria no dia errado.
 *
 * ── AS DUAS HORAS DA COLETA SÃO AS DUAS COLUNAS DA PLANILHA ───────────────────────────────────
 *
 * "ETA ORIGEM" e "CPT ORIGEM" são o início e o fim da janela de coleta, que o TMS já guarda
 * separados. Conferido contra a planilha: 04:00/06:00, 10:00/11:01, 11:00/13:00.
 *
 * ── MOTORISTA E PLACA: O PORTAL MANDA, A ATRIBUIÇÃO COMPLETA ──────────────────────────────────
 *
 * A planilha mostra o que a portaria vai conferir, e isso é o que o CLIENTE enxerga — por isso o
 * nome e a placa saem de `customer_fields`. CPF e telefone não existem lá: vêm do nosso cadastro,
 * casados pelo nome, com a mesma ressalva de sempre (nome é chave frágil; onde não casa, a linha
 * mostra traço em vez de inventar).
 */
export interface LinhaDaProgramacao {
  tripId: string;
  externalTripId: string | null;
  /** `YYYY-MM-DD` no fuso da empresa — é por ele que a tela agrupa. */
  dia: string;
  regiao: string | null;
  origem: string | null;
  destino: string | null;
  /** Início e fim da janela de coleta: as colunas "ETA ORIGEM" e "CPT ORIGEM" da planilha. */
  etaOrigem: string | null;
  cptOrigem: string | null;
  etaDestino: string | null;
  perfil: string | null;
  solicitacao: string | null;
  status: string;
  acceptanceStatus: string | null;
  portalStatus: string | null;
  motorista: string | null;
  placa: string | null;
  cpf: string | null;
  telefone: string | null;
  /** A camada pessoal: cor posta por quem está olhando, e se ela escondeu esta linha. */
  cor: string | null;
  oculta: boolean;
}

export async function readProgramacao(
  userId: string,
  opcoes: { diasAtras?: number; diasAdiante?: number; regiao?: string | null } = {},
): Promise<LinhaDaProgramacao[]> {
  const diasAtras = opcoes.diasAtras ?? 1;
  const diasAdiante = opcoes.diasAdiante ?? 7;
  const regiao = opcoes.regiao ?? null;

  const linhas = await db.execute<{
    trip_id: string;
    external_trip_id: string | null;
    dia: string;
    regiao: string | null;
    origem: string | null;
    destino: string | null;
    eta_origem: string | null;
    cpt_origem: string | null;
    eta_destino: string | null;
    perfil: string | null;
    solicitacao: string | null;
    status: string;
    aceitacao: string | null;
    status_portal: string | null;
    motorista: string | null;
    placa: string | null;
    cpf: string | null;
    telefone: string | null;
    cor: string | null;
    oculta: boolean;
  }>(sql`
    with motorista_do_portal as (
      -- Um SELECT por viagem para achar CPF e telefone seria uma ida ao banco por linha. Aqui o
      -- cadastro inteiro entra uma vez, dobrado pelo nome, e o casamento vira um join.
      select distinct on (upper(btrim(name))) upper(btrim(name)) as nome, cpf, phone
        from drivers
       where archived_at is null
       order by upper(btrim(name)), (phone is null), (cpf is null)
    )
    select
      t.id as trip_id,
      t.external_trip_id,
      to_char(t.planned_pickup_window_start at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia,
      lo.region::text as regiao,
      lo.name as origem,
      ld.name as destino,
      to_char(t.planned_pickup_window_start at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as eta_origem,
      to_char(t.planned_pickup_window_end   at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as cpt_origem,
      to_char(t.planned_delivery_window_end at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as eta_destino,
      t.planned_vehicle_type::text as perfil,
      t.operational_fields ->> 'solicitacao' as solicitacao,
      t.current_status::text as status,
      t.customer_fields ->> 'Aceitação (portal)' as aceitacao,
      t.customer_fields ->> 'Status (portal)' as status_portal,
      t.customer_fields ->> 'Motorista (portal)' as motorista,
      t.customer_fields ->> 'Placa (portal)' as placa,
      m.cpf,
      m.phone as telefone,
      w.cor,
      coalesce(w.oculta, false) as oculta
    from trips t
    left join locations lo on lo.id = t.origin_location_id
    left join locations ld on ld.id = t.destination_location_id
    left join motorista_do_portal m
      on m.nome = upper(btrim(t.customer_fields ->> 'Motorista (portal)'))
    left join ${userWatchedTrips} w on w.trip_id = t.id and w.user_id = ${userId}
    where t.planned_pickup_window_start is not null
      -- A janela é em DIAS de calendário, não em horas: "ontem" tem de trazer a viagem das 06h de
      -- ontem, e subtrair 24 horas de agora a deixaria de fora pela manhã.
      and (t.planned_pickup_window_start at time zone 'America/Sao_Paulo')::date
            >= (now() at time zone 'America/Sao_Paulo')::date - ${diasAtras}::int
      and (t.planned_pickup_window_start at time zone 'America/Sao_Paulo')::date
            <= (now() at time zone 'America/Sao_Paulo')::date + ${diasAdiante}::int
      -- Encerrada e cancelada saem: a programação é sobre o que ainda vai acontecer ou acabou de
      -- acontecer, e a planilha também não guarda o que morreu.
      and t.current_status not in ('cancelled', 'billing_pending', 'billing_ready', 'billed')
      and (${regiao}::text is null or lo.region::text = ${regiao})
    order by t.planned_pickup_window_start, t.external_trip_id
  `);

  return linhas.map((r) => ({
    tripId: r.trip_id,
    externalTripId: r.external_trip_id,
    dia: r.dia,
    regiao: r.regiao,
    origem: r.origem,
    destino: r.destino,
    etaOrigem: r.eta_origem,
    cptOrigem: r.cpt_origem,
    etaDestino: r.eta_destino,
    perfil: r.perfil,
    solicitacao: r.solicitacao,
    status: r.status,
    acceptanceStatus: r.aceitacao,
    portalStatus: r.status_portal,
    motorista: r.motorista,
    placa: r.placa,
    cpf: r.cpf,
    telefone: r.telefone,
    cor: r.cor,
    oculta: r.oculta,
  }));
}

/**
 * A MARCA PESSOAL: a cor e o esconder, numa linha só por (pessoa, viagem).
 *
 * `onConflictDoUpdate` porque a mesma linha carrega as duas coisas — quem esconde uma LH que já
 * estava colorida não pode perder a cor, e vice-versa. Passar `undefined` mantém o que estava.
 */
export async function marcarViagem(
  userId: string,
  tripId: string,
  marca: { cor?: string | null; oculta?: boolean },
): Promise<void> {
  await db
    .insert(userWatchedTrips)
    .values({ userId, tripId, cor: marca.cor ?? null, oculta: marca.oculta ?? false })
    .onConflictDoUpdate({
      target: [userWatchedTrips.userId, userWatchedTrips.tripId],
      set: {
        ...(marca.cor !== undefined ? { cor: marca.cor } : {}),
        ...(marca.oculta !== undefined ? { oculta: marca.oculta } : {}),
      },
    });
}

export async function acompanharViagem(userId: string, tripId: string): Promise<void> {
  await db.insert(userWatchedTrips).values({ userId, tripId }).onConflictDoNothing();
}

export async function pararDeAcompanhar(userId: string, tripId: string): Promise<void> {
  await db
    .delete(userWatchedTrips)
    .where(and(eq(userWatchedTrips.userId, userId), eq(userWatchedTrips.tripId, tripId)));
}
