import { count, eq, sql, type SQL } from "drizzle-orm";
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
 * O NOME DA ESTAÇÃO COMPARADO SEM O QUE NÃO IDENTIFICA (2026-08-24, a pedido).
 *
 * A oferta de spot traz a rota como TEXTO, e o fornecedor escreve o mesmo lugar de dois jeitos:
 *
 *     oferta    SoC_GO_Goiânia_02
 *     cadastro  SOC_GO_GOIANIA_02 (AEROPORTO)
 *
 * A comparação era literal, então acento, caixa e o sufixo entre parênteses derrubavam o casamento —
 * e a oferta sumia de TODOS os cartões, em silêncio. Quatro ofertas reais de Goiânia (frente SULCO)
 * estavam sendo contadas como nada.
 *
 * O parêntese sai porque descreve o lugar sem identificá-lo: "(AEROPORTO)" e "(HIDROLÂNDIA)"
 * distinguem duas estações de Goiânia, mas o que as separa de verdade é o `_02` no nome — e esse
 * fica. Medido: o dobramento não colapsa nenhum par de estações DIFERENTES.
 *
 * O que ele NÃO conserta, e é deliberado: `FM Hub_PR_Umuarama_02` continua sem casar com
 * `LM Hub_PR_Umuarama`. Ali muda o PREFIXO, que é o tipo da estação, e tratar FM e LM como o mesmo
 * lugar seria inventar uma equivalência que ninguém confirmou. Sobram 6 ofertas assim, e o caminho
 * para elas é cadastro ou apelido — não regra de texto.
 */
const chaveDaEstacao = (col: SQL) => sql`
  upper(btrim(regexp_replace(
    regexp_replace(
      translate(${col},
        'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑáàãâäéèêëíìîïóòõôöúùûüçñ',
        'AAAAAEEEEIIIIOOOOOUUUUCNAAAAAEEEEIIIIOOOOOUUUUCN'),
      '\\([^)]*\\)', '', 'g'),
    '\\s+', ' ', 'g')))`;

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
    with estacao as (
      -- UM local por NOME DOBRADO, e o distinct on não é enfeite: o cadastro tem TRÊS pares de
      -- estações com o nome repetido (LM HUB_MG_BELO HORIZONTE_02, FM HUB_PR_UMUARAMA_PQ_INDUST_II,
      -- LM Hub_RJ_Cabo Frio_Jd Flamb). Sem ele a oferta dessas casaria com DUAS linhas e o cartão
      -- contaria em dobro — erro que apareceria como "o spot de Minas dobrou", sem nada explicando.
      select distinct on (chave) chave, region
      from (
        select ${chaveDaEstacao(sql`name`)} as chave, region, id
        from locations
        where archived_at is null
      ) l
      order by chave, id
    ),
    oferta as (
      select
        s.portal_trip_id,
        ${chaveDaEstacao(sql`trim(split_part(s.route, '->', 1))`)} as chave
      from spot_offers s
      where s.received_at > now() - interval '24 hours'
    )
    select
      e.region::text as region,
      count(*) filter (where t.id is not null) as aceito,
      count(*) filter (where t.id is null) as nao_aceito
    from oferta o
    join estacao e on e.chave = o.chave
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
