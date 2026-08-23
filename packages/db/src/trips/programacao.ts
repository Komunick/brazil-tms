import { count, eq, sql } from "drizzle-orm";
import { regionPosition } from "@brazil-tms/shared";
import { db } from "../client";
import { locations, trips } from "../../schema";
import { origemAtrasadaSql } from "./atrasos";

/**
 * O QUE FALTAVA NO CARTÃO DA REGIÃO: origem atrasada e spot (2026-08-22, a pedido).
 *
 * Veio de uma foto de quadro branco com quatro blocos por frente — PLAN, SPOT, ORIGEM, TENDÊNCIA.
 * Uma tela própria chegou a ser construída e foi DESCARTADA no mesmo dia, e a razão vale ficar
 * escrita: dois dos quatro blocos já viviam no painel. PLAN (H+12/H+24) são os cartões de hoje, D1 e
 * D2 que já existem; TENDÊNCIA é a lista de status que cada cartão já mostra — o que está em análise
 * contra o resto. Tela nova para metade de uma informação que já estava na tela é tela a mais, e o
 * desenho novo ainda inventava uma linguagem visual que ninguém tinha pedido.
 *
 * Sobraram os dois blocos que de fato faltavam, e este arquivo é só eles.
 *
 * ── POR QUE PELA REGIÃO DA ORIGEM ───────────────────────────────────────────────────────────────
 *
 * Como o resto do painel: um LH liga duas pontas que podem estar em regiões diferentes, e a planilha
 * do cliente titula a coluna "ESTAÇÃO ORIGEM". Estação sem região vira grupo próprio em vez de
 * sumir — medido no dia em que isto nasceu: das 27 viagens com origem atrasada, NOVE estavam em
 * estação sem região. Um terço do alarme desapareceria da tela sem ninguém desconfiar.
 */

/** Quantas viagens desta frente já passaram do prazo de chegada na origem. */
export interface OrigemAtrasadaDaRegiao {
  /** `null` = estação ainda sem região cadastrada. */
  region: string | null;
  count: number;
}

/** O leilão de spot desta frente nas últimas 24h: o que a empresa pegou e o que passou. */
export interface SpotDaRegiao {
  region: string | null;
  aceito: number;
  naoAceito: number;
}

/**
 * Quem tinha motorista escalado e não deu entrada na origem depois da hora.
 *
 * A regra inteira — o STA que já vem pronto do portal, o "não chegou" tirado do status e a exigência
 * de haver alguém escalado — mora em `origemAtrasadaSql`, porque o quadro precisa LISTAR exatamente
 * o que este número conta.
 */
export async function readOrigemAtrasadaPorRegiao(): Promise<OrigemAtrasadaDaRegiao[]> {
  const linhas = await db
    .select({ region: locations.region, value: count() })
    .from(trips)
    .leftJoin(locations, eq(locations.id, trips.originLocationId))
    .where(origemAtrasadaSql())
    .groupBy(locations.region);

  return linhas
    .map((r) => ({ region: r.region ?? null, count: r.value }))
    .sort((a, b) => regionPosition(a.region) - regionPosition(b.region));
}

/**
 * O leilão de spot da frente nas últimas 24 horas.
 *
 * A oferta guarda a rota como texto (`SoC_BA_Simoes Filho  ->  LM Hub_BA_Simões Filho`), então a
 * frente sai do NOME da estação de origem casado com o cadastro. Oferta de estação que não é nossa
 * fica de fora, e isso é correto: rota que a empresa não roda não é trabalho dela.
 *
 * "ACEITA" É A OFERTA QUE VIROU VIAGEM. Não existe campo de aceite na oferta, e não precisa existir:
 * quando alguém pega no portal, ela reaparece na leitura seguinte com o mesmo id. A existência da
 * viagem é a prova mais forte disponível — mais forte, inclusive, do que um campo que o fornecedor
 * poderia preencher de outro jeito amanhã.
 */
export async function readSpotPorRegiao(): Promise<SpotDaRegiao[]> {
  const linhas = await db.execute<{
    region: string | null;
    aceito: string;
    nao_aceito: string;
  }>(sql`
    with oferta as (
      select
        s.portal_trip_id,
        lower(trim(split_part(s.route, '->', 1))) as origem
      from spot_offers s
      where s.received_at > now() - interval '24 hours'
    )
    select
      lo.region::text as region,
      count(*) filter (where t.id is not null) as aceito,
      count(*) filter (where t.id is null) as nao_aceito
    from oferta o
    join locations lo on lower(lo.name) = o.origem
    left join trips t on (t.customer_fields ->> 'ID (portal)') = o.portal_trip_id
    group by 1
  `);

  return linhas
    .map((r) => ({
      region: r.region ?? null,
      aceito: Number(r.aceito),
      naoAceito: Number(r.nao_aceito),
    }))
    .sort((a, b) => regionPosition(a.region) - regionPosition(b.region));
}
