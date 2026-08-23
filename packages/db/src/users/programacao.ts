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
export async function acompanharViagem(userId: string, tripId: string): Promise<void> {
  await db.insert(userWatchedTrips).values({ userId, tripId }).onConflictDoNothing();
}

export async function pararDeAcompanhar(userId: string, tripId: string): Promise<void> {
  await db
    .delete(userWatchedTrips)
    .where(and(eq(userWatchedTrips.userId, userId), eq(userWatchedTrips.tripId, tripId)));
}
