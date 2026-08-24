import { sql } from "drizzle-orm";
import { db } from "../client";
import { driverRecords } from "../../schema";

/**
 * O HISTÓRICO DE UM MOTORISTA: o que ele rodou e o que aconteteu com ele (2026-08-24, a pedido).
 *
 * Duas metades que respondem perguntas diferentes e por isso ficam juntas:
 *
 *   AS ROTAS  — derivadas das viagens, sem ninguém digitar nada. "Ele já fez esse trecho?" é a
 *               primeira pergunta de quem escala, e a resposta já estava no banco.
 *   OS FATOS  — reclamação, atraso, elogio, advertência. Escritos por quem viu, porque não há como
 *               derivar do dado: nenhuma coluna do TMS sabe que o cliente ligou reclamando.
 *
 * A nota do ranking mede uma coisa só — entrega no prazo. Um motorista de 95% que levou duas
 * advertências no mês não aparece diferente de um de 95% sem nenhuma, e a diferença é justamente o
 * que decide na hora de escalar.
 */

export interface RotaDoMotorista {
  origem: string | null;
  destino: string | null;
  viagens: number;
  /** A última vez que ele fez este trecho — "já fez" e "faz sempre" não são a mesma informação. */
  ultima: string | null;
}

export interface RegistroDoMotorista {
  id: string;
  tipo: string;
  texto: string;
  tripId: string | null;
  externalTripId: string | null;
  autor: string | null;
  criadoEm: string;
}

/**
 * As rotas que este motorista já rodou, da mais frequente para a menos.
 *
 * Conta ATRIBUIÇÃO, não viagem em qualquer estado: o que interessa é o trecho que ele de fato
 * pegou. E conta a atribuição VIGENTE — uma viagem que passou por três motoristas conta para quem
 * está nela agora, não para os três.
 */
export async function readRotasDoMotorista(driverId: string): Promise<RotaDoMotorista[]> {
  const linhas = await db.execute<{
    origem: string | null;
    destino: string | null;
    viagens: string;
    ultima: string | null;
  }>(sql`
    select
      lo.name as origem,
      ld.name as destino,
      count(*) as viagens,
      to_char(max(t.planned_pickup_window_start) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') as ultima
    from trip_assignments a
    join trips t on t.id = a.trip_id
    left join locations lo on lo.id = t.origin_location_id
    left join locations ld on ld.id = t.destination_location_id
    where a.driver_id = ${driverId} and a.is_current
    group by 1, 2
    order by count(*) desc, max(t.planned_pickup_window_start) desc
    limit 20
  `);

  return linhas.map((r) => ({
    origem: r.origem,
    destino: r.destino,
    viagens: Number(r.viagens),
    ultima: r.ultima,
  }));
}

/** Os registros, do mais novo para o mais velho — é assim que se lê um caderno de ocorrências. */
export async function readRegistrosDoMotorista(
  driverId: string,
): Promise<RegistroDoMotorista[]> {
  const linhas = await db.execute<{
    id: string;
    tipo: string;
    texto: string;
    trip_id: string | null;
    external_trip_id: string | null;
    autor: string | null;
    criado_em: string;
  }>(sql`
    select
      r.id, r.tipo, r.texto, r.trip_id,
      t.external_trip_id,
      u.name as autor,
      to_char(r.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as criado_em
    from ${driverRecords} r
    left join trips t on t.id = r.trip_id
    left join users u on u.id = r.created_by_user_id
    where r.driver_id = ${driverId}
    order by r.created_at desc
    limit 200
  `);

  return linhas.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    texto: r.texto,
    tripId: r.trip_id,
    externalTripId: r.external_trip_id,
    autor: r.autor,
    criadoEm: r.criado_em,
  }));
}

/**
 * Registrar. Não há editar nem apagar, e é de propósito — ver o comentário da tabela.
 *
 * O CHECK do banco recusa categoria fora da lista e texto vazio; a validação da rota recusa antes,
 * com mensagem melhor. As duas existem porque a rota pode mudar e o banco é o último a ceder.
 */
export async function registrarNoMotorista(entrada: {
  driverId: string;
  tipo: string;
  texto: string;
  tripId?: string | null;
  createdByUserId: string;
}): Promise<void> {
  await db.insert(driverRecords).values({
    driverId: entrada.driverId,
    tipo: entrada.tipo,
    texto: entrada.texto.trim(),
    tripId: entrada.tripId ?? null,
    createdByUserId: entrada.createdByUserId,
  });
}
