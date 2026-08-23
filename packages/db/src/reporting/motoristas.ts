import { sql } from "drizzle-orm";
import { db } from "../client";

/**
 * O DESEMPENHO DE CADA MOTORISTA, e o de cada um em cada rota (2026-08-23, a pedido).
 *
 * ── A RÉGUA É A ENTREGA, NÃO A CHEGADA NA ORIGEM ──────────────────────────────────────────────
 *
 * A primeira ideia foi ranquear pela chegada na origem, que é o que a operação cobra no dia a dia.
 * Medido, não serve: 1.622 chegadas em trinta dias, DEZENOVE atrasadas, média de três horas e meia
 * de antecedência. Um ranking em que trezentos motoristas empatam em 100% não escolhe ninguém.
 *
 * A entrega no destino separa: 77% no prazo, com gente de 40% a 100% na mesma rota. E não é
 * coincidência — "ETA Destino" é o indicador do BSC que está vermelho (83,61 contra meta 95). Um
 * ranking construído sobre essa régua fala a mesma língua da nota que o cliente dá.
 *
 * ── O QUE CONTA COMO "NO PRAZO" ───────────────────────────────────────────────────────────────
 *
 * Chegou no destino até a hora que o cliente publicou. A hora da chegada é a do PORTAL (o `ata` que
 * vem em toda listagem e vira o marco `at_destination`), não a hora em que o robô leu.
 *
 * Sem filtro de "quanto tempo depois da ingestão": os eventos vêm todos de `import`, e com o leitor
 * rodando de vinte em vinte segundos a chegada de agora é lida agora. Um filtro assim descartava 588
 * entregas legítimas — as mais recentes, justamente.
 *
 * ── E POR QUE O NÚMERO DE VIAGENS ANDA SEMPRE JUNTO ───────────────────────────────────────────
 *
 * Porque 100% em duas viagens não é melhor do que 86% em dezesseis, e um ranking que mostra só o
 * percentual faz exatamente essa troca. Quem consome estes dados — inclusive a tela de atribuição —
 * recebe os dois e decide com os dois à vista.
 */

export interface DesempenhoDoMotorista {
  motorista: string;
  entregas: number;
  noPrazo: number;
  /** 0–100, arredondado. `entregas` sempre acompanha: sem ele o percentual mente. */
  pct: number;
  /** Está em viagem agora? Quem escala precisa saber antes de contar com ele. */
  emViagem: boolean;
}

export interface DesempenhoNaRota extends DesempenhoDoMotorista {
  laneId: string;
  origem: string;
  destino: string;
  region: string | null;
}

/**
 * A base: uma linha por viagem entregue, com motorista, rota e se chegou no prazo.
 *
 * `min(event_timestamp)` porque uma viagem pode ter mais de um marco de chegada ao destino (pernas,
 * releituras): a primeira é a que conta.
 */
const ENTREGAS = sql`
  select
    t.id,
    t.lane_id,
    t.customer_fields ->> 'Motorista (portal)' as motorista,
    min(e.event_timestamp) <= t.planned_delivery_window_start as no_prazo
  from trips t
  join trip_events e on e.trip_id = t.id and e.status_after = 'at_destination'
  where e.source = 'import'
    and e.event_timestamp is not null
    and t.planned_delivery_window_start is not null
    and (t.customer_fields ->> 'Motorista (portal)') is not null
  group by t.id, t.lane_id, 3, t.planned_delivery_window_start
`;

/** Quem está com viagem em andamento agora — do `assigned` ao `unloaded`. */
const EM_VIAGEM = sql`
  select distinct t.customer_fields ->> 'Motorista (portal)' as motorista
  from trips t
  where t.current_status in
    ('assigned','at_origin','loading','loaded','in_transit','at_destination','unloading','unloaded')
    and (t.customer_fields ->> 'Motorista (portal)') is not null
`;

export async function readDesempenhoGeral(): Promise<DesempenhoDoMotorista[]> {
  const linhas = await db.execute<{
    motorista: string;
    entregas: string;
    no_prazo: string;
    em_viagem: boolean;
  }>(sql`
    with entregas as (${ENTREGAS}), em_viagem as (${EM_VIAGEM})
    select
      x.motorista,
      count(*) as entregas,
      count(*) filter (where x.no_prazo) as no_prazo,
      exists (select 1 from em_viagem v where v.motorista = x.motorista) as em_viagem
    from entregas x
    group by 1
    order by 2 desc
  `);

  return linhas.map(paraDesempenho);
}

/**
 * O mesmo, quebrado por rota — a pergunta "quem é o melhor NESTA rota".
 *
 * Só pares com pelo menos duas entregas: com uma, a linha é uma anedota ocupando espaço. O corte de
 * quatro (quatro) é da TELA, não daqui — quem consome pode querer mostrar as poucas
 * dizendo que são poucas, e não dá para reconstruir no navegador o que a consulta jogou fora.
 */
export async function readDesempenhoPorRota(): Promise<DesempenhoNaRota[]> {
  const linhas = await db.execute<{
    lane_id: string;
    origem: string;
    destino: string;
    region: string | null;
    motorista: string;
    entregas: string;
    no_prazo: string;
    em_viagem: boolean;
  }>(sql`
    with entregas as (${ENTREGAS}), em_viagem as (${EM_VIAGEM})
    select
      l.id as lane_id,
      lo.name as origem,
      ld.name as destino,
      lo.region::text as region,
      x.motorista,
      count(*) as entregas,
      count(*) filter (where x.no_prazo) as no_prazo,
      exists (select 1 from em_viagem v where v.motorista = x.motorista) as em_viagem
    from entregas x
    join lanes l on l.id = x.lane_id
    join locations lo on lo.id = l.origin_location_id
    join locations ld on ld.id = l.destination_location_id
    group by 1, 2, 3, 4, 5
    having count(*) >= 2
    order by 2, 3, 6 desc
  `);

  return linhas.map((r) => ({
    ...paraDesempenho(r),
    laneId: r.lane_id,
    origem: r.origem,
    destino: r.destino,
    region: r.region ?? null,
  }));
}

function paraDesempenho(r: {
  motorista: string;
  entregas: string;
  no_prazo: string;
  em_viagem: boolean;
}): DesempenhoDoMotorista {
  const entregas = Number(r.entregas);
  const noPrazo = Number(r.no_prazo);
  return {
    motorista: r.motorista,
    entregas,
    noPrazo,
    pct: entregas === 0 ? 0 : Math.round((noPrazo / entregas) * 100),
    emViagem: r.em_viagem,
  };
}
