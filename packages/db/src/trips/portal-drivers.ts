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
  /**
   * A validade da CNH, do NOSSO cadastro (2026-08-25).
   *
   * Vem casada pelo `portal_driver_id`, e é `null` em dois casos que a tela precisa distinguir: o
   * motorista não existe no nosso cadastro, ou existe e ninguém preencheu a data. Quem desenha
   * trata os dois como "não sei" — que é diferente de "está em dia".
   *
   * O portal não tem esse dado, e a Logae tem (`getMotorista.DataVencCNH`): conferido em duas
   * amostras, o nosso cadastro concorda com ela em 83 de 84. Ou seja, esta coluna é confiável — o
   * que faltava não era o dado, era alguém olhar para ele na hora de escalar.
   */
  licenseExpiry: string | null;
  /**
   * O vínculo já classificado deste motorista — `null` quando ninguém classificou ainda (026).
   *
   * A gerenciadora Logae exige saber se ele é frota, agregado ou terceiro. O nosso cadastro guarda
   * `subcontracted` para 405 motoristas, que aqui significa **ainda não classificado** e chega como
   * `null` — a tela pergunta uma vez, grava, e não pergunta de novo (FR-010).
   */
  vinculo: "owned" | "agregado" | "terceiro" | null;
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
    license_expiry: string | null;
    ownership_type: string | null;
  }>(sql`
    select distinct on (id_portal)
      id_portal   as portal_driver_id,
      nome        as name,
      viagens     as trips,
      visto       as last_seen_at,
      -- LEFT JOIN, e nunca INNER: o motorista que ainda não existe no nosso cadastro precisa
      -- continuar aparecendo na lista. Some a validade, não o nome.
      d.license_expiry::text as license_expiry,
      d.ownership_type::text as ownership_type
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
    left join drivers d on d.portal_driver_id = t.id_portal
    -- t.updated_at QUALIFICADO: a tabela drivers também tem essa coluna, e sem o prefixo o
    -- Postgres recusa a consulta inteira por ambiguidade. Não é preciosismo: quebrou de verdade ao
    -- ligar o join, e nenhum teste unitário pegaria, porque quem responde isso é o banco.
    order by id_portal, t.updated_at desc
  `);

  return linhas
    .map((r) => ({
      portalDriverId: Number(r.portal_driver_id),
      name: r.name,
      trips: Number(r.trips),
      lastSeenAt: new Date(r.last_seen_at).toISOString(),
      licenseExpiry: r.license_expiry ?? null,
      vinculo: comoVinculo(r.ownership_type),
    }))
    .filter((m) => Number.isFinite(m.portalDriverId) && m.portalDriverId > 0)
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || b.trips - a.trips)
    .slice(0, limite);
}

/**
 * O que o banco guarda → o que a tela entende.
 *
 * `subcontracted` vira `null` de propósito: para quem está escalando, ele é AUSÊNCIA de
 * classificação, não um quarto tipo. Um campo vazio pede resposta; um campo escrito "de fora" não
 * pede nada, e os 405 motoristas nessa situação nunca seriam classificados.
 *
 * Qualquer outro valor inesperado também vira `null` — melhor pedir de novo do que mandar para a
 * gerenciadora algo que ninguém sabe o que é.
 */
function comoVinculo(v: string | null): "owned" | "agregado" | "terceiro" | null {
  return v === "owned" || v === "agregado" || v === "terceiro" ? v : null;
}
