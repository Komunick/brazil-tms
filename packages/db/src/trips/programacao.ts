import { eq, or, sql, type SQL } from "drizzle-orm";
import { regionPosition } from "@brazil-tms/shared";
import { db } from "../client";
import { locations, trips } from "../../schema";
import { origemAtrasadaSql, origemRiscoSql } from "./atrasos";

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

/**
 * O atraso na origem desta frente, nas DUAS janelas que a operação distingue (2026-08-27).
 *
 * O motorista tem de dar entrada na origem duas horas antes da coleta. Daí as duas colunas do
 * quadro: uma é onde ainda dá para ligar, a outra é onde já perdeu. A regra de cada uma mora em
 * `atrasos.ts`; aqui só a contagem.
 */
export interface OrigemAtrasadaDaRegiao {
  /** `null` = estação ainda sem região cadastrada. */
  region: string | null;
  /** FORA DO PRAZO: a hora da coleta passou e ele não chegou. */
  count: number;
  /** ATRASADO < 2HS: passou de "duas horas antes" e a hora da coleta ainda não chegou. */
  risco: number;
}

/** O leilão de spot desta frente nas últimas 24h: o que a empresa pegou e o que passou. */
export interface SpotDaRegiao {
  region: string | null;
  aceito: number;
  naoAceito: number;
  /**
   * AS ROTAS POR TRÁS DO NÚMERO (2026-08-27, a pedido).
   *
   * O quadro branco pede "aceitos + nome da rota ao clicar", e a razão é concreta: `4 aceitas` não
   * diz se a frente pegou as quatro que importavam ou quatro que ninguém queria. Quem cuida da
   * frente reconhece a rota pelo nome, e é isso que transforma o número em informação.
   *
   * Vem JUNTO com a contagem, na mesma consulta e no mesmo payload. Uma rota por clique seria uma
   * segunda ida ao servidor para trazer quatro linhas de texto — e o painel recarrega de minuto em
   * minuto de qualquer forma.
   *
   * ── E TRAZ O QUE O CARTÃO SEPARADO TRAZIA (2026-08-27, a pedido) ─────────────────────────────
   *
   * O painel tinha um cartão "Ofertas de spot hoje" à parte, com a hora, o preço e os campos da
   * oferta. Ele foi dobrado para dentro deste grupo, e por isso a rota deixou de viajar sozinha: a
   * lista que abre aqui precisa dizer o MESMO que aquele cartão dizia, senão dobrar teria sido
   * perder informação com passos a mais.
   *
   * Campo vazio vem nulo e a tela o omite. A maioria das ofertas chega sem preço, e uma coluna de
   * travessões ocuparia a linha inteira para dizer que não há nada a dizer.
   */
  rotas: {
    rota: string;
    aceito: boolean;
    /** O número da LH no portal, para quem for atrás dela. */
    lh: string | null;
    /** Quando a oferta chegou, em ISO. É por ela que se cruza com o Telegram. */
    hora: string;
    preco: string | null;
    /** O STA da origem: a hora de o caminhão ESTAR lá. É o que decide se dá para pegar. */
    sta: string | null;
    veiculo: string | null;
  }[];
}

/**
 * Quem tinha motorista escalado e não deu entrada na origem depois da hora.
 *
 * A regra inteira — o STA que já vem pronto do portal, o "não chegou" tirado do status e a exigência
 * de haver alguém escalado — mora em `origemAtrasadaSql`, porque o quadro precisa LISTAR exatamente
 * o que este número conta.
 */
export async function readOrigemAtrasadaPorRegiao(): Promise<OrigemAtrasadaDaRegiao[]> {
  /**
   * As duas janelas numa passada só, com `filter`.
   *
   * Duas consultas dariam a mesma resposta e abririam a porta para elas divergirem: uma varreria a
   * tabela num instante e a outra no seguinte, e "agora" muda entre as duas. Numa regra cujo
   * predicado inteiro é sobre `now()`, isso não é teórico — é a viagem que cruza o limite entre uma
   * consulta e outra, e some das duas colunas.
   */
  const linhas = await db
    .select({
      region: locations.region,
      fora: sql<number>`count(*) filter (where ${origemAtrasadaSql()})`,
      risco: sql<number>`count(*) filter (where ${origemRiscoSql()})`,
    })
    .from(trips)
    .leftJoin(locations, eq(locations.id, trips.originLocationId))
    .where(or(origemAtrasadaSql(), origemRiscoSql()))
    .groupBy(locations.region);

  return linhas
    .map((r) => ({
      region: r.region ?? null,
      count: Number(r.fora ?? 0),
      risco: Number(r.risco ?? 0),
    }))
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
 * frente sai do NOME da estação de origem casado com o cadastro.
 *
 * ── A OFERTA QUE NÃO CASA COM ESTAÇÃO NOSSA NÃO SOME MAIS (2026-08-27, a pedido) ──────────────
 *
 * Aqui havia um join fechado, com o argumento de que rota que a empresa não roda não é trabalho
 * dela. O argumento vale para a CONTAGEM e deixou de valer para a LISTA: o cartão separado que
 * mostrava todas as ofertas do dia foi dobrado para dentro deste grupo, e com o join fechado
 * dobrar teria escondido metade delas.
 *
 * Não é figura de linguagem — MEDIDO em PRODUÇÃO: 40 de 95 ofertas (42%) não casam com nenhuma
 * estação do cadastro. Elas apitam na TV e vão para o Telegram; faltar só no painel seria a pior
 * das três telas para elas sumirem, porque é a única em que se olha o dia inteiro de uma vez.
 *
 * Com o left join elas caem na frente NULA — a mesma de "estação sem região cadastrada". As duas
 * coisas são diferentes na origem e IGUAIS no que a operação faz com elas: não se sabe de qual
 * frente é. O cartão "Sem região" é onde essa resposta mora.
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
    rotas: SpotDaRegiao["rotas"] | null;
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
        s.route,
        s.received_at,
        s.trip_number,
        s.price,
        s.origin_arrival,
        s.vehicle,
        ${chaveDaEstacao(sql`trim(split_part(s.route, '->', 1))`)} as chave
      from spot_offers s
      where s.received_at > now() - interval '24 hours'
    )
    select
      e.region::text as region,
      count(*) filter (where t.id is not null) as aceito,
      count(*) filter (where t.id is null) as nao_aceito,
      /*
       * AS ROTAS, agregadas na mesma passada.
       *
       * O quadro branco pede "aceitos + nome da rota ao clicar", e a razao e concreta: "4 aceitas"
       * nao diz se a frente pegou as quatro que importavam ou quatro que ninguem queria. Quem cuida
       * da frente reconhece a rota pelo nome.
       *
       * Da MAIS RECENTE para a mais antiga: quem abre a lista quer o que acabou de acontecer, e a
       * oferta de vinte horas atras ja foi decidida ha muito.
       *
       * OS OUTROS CAMPOS chegaram com o cartao separado, que foi dobrado para dentro deste grupo
       * (2026-08-27). Eles nao custam consulta nova: a linha da oferta ja esta aqui, e trazer cinco
       * textos curtos dela e mais barato que a segunda ida ao servidor que a lista pediria.
       */
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'rota', o.route,
            'aceito', t.id is not null,
            'lh', o.trip_number,
            'hora', o.received_at,
            'preco', o.price,
            'sta', o.origin_arrival,
            'veiculo', o.vehicle
          )
          order by o.received_at desc
        ) filter (where o.route is not null),
        '[]'::jsonb
      ) as rotas
    from oferta o
    left join estacao e on e.chave = o.chave
    left join trips t on (t.customer_fields ->> 'ID (portal)') = o.portal_trip_id
    group by 1
  `);

  return linhas
    .map((r) => ({
      region: r.region ?? null,
      aceito: Number(r.aceito),
      naoAceito: Number(r.nao_aceito),
      /*
       * TETO DE VINTE, porque isto viaja no payload do painel inteiro — que recarrega de minuto em
       * minuto, numa TV que fica ligada o dia todo.
       *
       * Vinte cobre folgado o pior dia medido. O corte é aqui e não no SQL de propósito: a CONTAGEM
       * acima continua sendo do total, e um número que discordasse da lista embaixo dele seria pior
       * que lista nenhuma.
       */
      rotas: (Array.isArray(r.rotas) ? r.rotas : []).slice(0, 20),
    }))
    .sort((a, b) => regionPosition(a.region) - regionPosition(b.region));
}
