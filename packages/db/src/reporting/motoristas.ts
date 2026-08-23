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
 * ── E POR QUE EXISTE UMA NOTA, ALÉM DO PERCENTUAL ─────────────────────────────────────────────
 *
 * Porque o percentual cru premia quem rodou pouco: "duas entregas, 100%" passa na frente de "vinte
 * entregas, 93%", e escalar por isso é escalar por sorte. O defeito foi apontado pelo usuário
 * olhando a primeira versão desta tela, e é o clássico de todo ranking por proporção.
 *
 * A nota é o percentual com um CRÉDITO INICIAL: cada motorista começa como se tivesse cinco
 * entregas na média da empresa, e o próprio desempenho puxa esse número conforme ele roda. Quem
 * tem volume chega perto do seu percentual real; quem tem duas viagens fica perto da média — que é
 * a afirmação honesta: ainda não sabemos.
 *
 * Medido no dado real: 2 entregas a 100% dá nota 84, e 20 entregas a 93% dá 91. A ordem inverte, e
 * é a inversão certa. No topo da empresa, quem tem 50 entregas a 94% passa à frente de quem tem 8
 * a 100%.
 *
 * A nota ORDENA; o percentual cru e o número de entregas EXPLICAM, e os três ficam na tela.
 * Esconder qualquer um seria pedir confiança cega.
 */

export interface DesempenhoDoMotorista {
  motorista: string;
  entregas: number;
  noPrazo: number;
  /** O percentual CRU, 0–100: o que de fato aconteceu. Nunca ordena sozinho — ver `nota`. */
  pct: number;
  /** O percentual com o crédito inicial, 0–100. É por ele que se ordena. */
  nota: number;
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

/**
 * O peso do crédito inicial, em entregas.
 *
 * Cinco: com cinco entregas o motorista vale metade do próprio desempenho e metade da média da
 * empresa; com vinte, a média quase não pesa mais. É escolha, não medida — está aqui, com nome,
 * para ser discutida.
 */
const CREDITO_INICIAL = 5;

/** A média da empresa, que é o palpite inicial sobre quem ainda não tem histórico. */
const MEDIA_DA_EMPRESA = sql`(select avg(case when no_prazo then 1.0 else 0.0 end) from entregas)`;

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
    nota: string;
    em_viagem: boolean;
  }>(sql`
    with entregas as (${ENTREGAS}), em_viagem as (${EM_VIAGEM})
    select
      x.motorista,
      count(*) as entregas,
      count(*) filter (where x.no_prazo) as no_prazo,
      round(100 * (count(*) filter (where x.no_prazo) + ${CREDITO_INICIAL} * ${MEDIA_DA_EMPRESA})
            / (count(*) + ${CREDITO_INICIAL})) as nota,
      exists (select 1 from em_viagem v where v.motorista = x.motorista) as em_viagem
    from entregas x
    group by 1
    order by 4 desc, 2 desc
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
    nota: string;
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
      round(100 * (count(*) filter (where x.no_prazo) + ${CREDITO_INICIAL} * ${MEDIA_DA_EMPRESA})
            / (count(*) + ${CREDITO_INICIAL})) as nota,
      exists (select 1 from em_viagem v where v.motorista = x.motorista) as em_viagem
    from entregas x
    join lanes l on l.id = x.lane_id
    join locations lo on lo.id = l.origin_location_id
    join locations ld on ld.id = l.destination_location_id
    group by 1, 2, 3, 4, 5
    having count(*) >= 2
    order by 2, 3, 7 desc
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
  nota: string;
  em_viagem: boolean;
}): DesempenhoDoMotorista {
  const entregas = Number(r.entregas);
  const noPrazo = Number(r.no_prazo);
  return {
    motorista: r.motorista,
    entregas,
    noPrazo,
    pct: entregas === 0 ? 0 : Math.round((noPrazo / entregas) * 100),
    nota: Number(r.nota),
    emViagem: r.em_viagem,
  };
}
