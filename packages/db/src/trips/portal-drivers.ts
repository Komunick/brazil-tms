import { sql } from "drizzle-orm";
import { db } from "../client";

/**
 * OS MOTORISTAS QUE O PORTAL CONHECE, aprendidos do que ele já nos contou (2026-08-21).
 *
 * Para escalar alguém no portal é preciso o ID DELE lá — `driver_id: 3751471`, não o nome, não o id
 * do TMS. E a lista de quem pode ser escalado é do portal, não nossa: o cadastro de motoristas do
 * TMS tem 1.378 nomes, e o portal aceita só os que estão no cadastro dele.
 *
 * ── DE ONDE ELA SAI, SEM UMA CHAMADA A MAIS ────────────────────────────────────────────────────
 *
 * O robô de leitura traz `driver` (o id) e `driver_name` em toda viagem que já tem motorista, e o
 * TMS guarda os dois desde 17/08. Medido hoje: **536 motoristas distintos** em 3.842 viagens.
 *
 * Isso é melhor do que perguntar ao portal a lista completa dele por dois motivos. É de graça — o
 * dado já está no banco. E é a lista CERTA: são os motoristas que esta agência de fato usa, ordenados
 * por quem rodou mais recentemente, em vez de um cadastro inteiro onde os quinze do dia a dia se
 * perdem no meio de centenas.
 *
 * O preço: um motorista recém-cadastrado no portal, que nunca rodou, não aparece aqui até a primeira
 * viagem dele. É um caso real, e a tela diz isso — em vez de a pessoa procurar um nome que o sistema
 * nunca teve como conhecer.
 */

export interface MotoristaDoPortal {
  /** O id no portal. É o que vai no `driver_id` da atribuição. */
  portalDriverId: number;
  /** Como o portal escreve o nome. Vem dele, não do nosso cadastro. */
  name: string;
  /** Em quantas viagens ele apareceu — a régua de "é do dia a dia ou foi uma vez". */
  trips: number;
  /** A viagem mais recente em que apareceu, para a tela ordenar por quem está ativo. */
  lastSeenAt: string;
}

/**
 * A lista, do mais recente para o mais antigo.
 *
 * `DISTINCT ON` pelo id: o mesmo motorista aparece com grafias diferentes ao longo do tempo (o portal
 * ora escreve em caixa alta, ora não), e o que manda é o id. Fica a grafia da viagem mais recente,
 * que é a que a operação viu por último.
 */
export async function listarMotoristasDoPortal(limite = 600): Promise<MotoristaDoPortal[]> {
  const linhas = await db.execute<{
    portal_driver_id: string;
    name: string;
    trips: string;
    last_seen_at: Date;
  }>(sql`
    select distinct on (id_portal)
      id_portal   as portal_driver_id,
      nome        as name,
      viagens     as trips,
      visto       as last_seen_at
    from (
      select
        (customer_fields ->> 'ID do motorista (portal)') as id_portal,
        (customer_fields ->> 'Motorista (portal)')       as nome,
        count(*) over (partition by (customer_fields ->> 'ID do motorista (portal)')) as viagens,
        max(updated_at) over (partition by (customer_fields ->> 'ID do motorista (portal)')) as visto,
        updated_at
      from trips
      where customer_fields ? 'ID do motorista (portal)'
        and coalesce(customer_fields ->> 'Motorista (portal)', '') <> ''
    ) t
    order by id_portal, updated_at desc
  `);

  return linhas
    .map((r) => ({
      portalDriverId: Number(r.portal_driver_id),
      name: r.name,
      trips: Number(r.trips),
      lastSeenAt: new Date(r.last_seen_at).toISOString(),
    }))
    .filter((m) => Number.isFinite(m.portalDriverId) && m.portalDriverId > 0)
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || b.trips - a.trips)
    .slice(0, limite);
}
