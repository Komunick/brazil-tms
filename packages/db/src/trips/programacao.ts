import { eq, or, sql, type SQL } from "drizzle-orm";
import {
  ACEITACAO_ACEITA,
  estadoDaOferta,
  regionPosition,
  type EstadoDaOferta,
} from "@brazil-tms/shared";
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
  /**
   * SPOT é o leilão de HOJE; TENDÊNCIA é o de amanhã em diante (2026-08-28, a pedido).
   *
   * É o mesmo dado com dois recortes, e quem separa é a data da VIAGEM — o STA da origem —, não
   * a hora em que a oferta chegou: a mesma oferta pode chegar hoje de manhã falando de uma carga
   * de quinta. As duas contam só o que foi recebido nas últimas 24h.
   *
   * Viagem que já passou e oferta sem data caem no SPOT, decidido assim: escrever a regra como
   * "é futuro?" põe o caso duvidoso do lado que já existia, em vez de sumir das duas colunas.
   */
  aceito: number;
  naoAceito: number;
  /**
   * A TERCEIRA CONTA, que faltava (2026-09-01, fatia 030).
   *
   * `aceito` era "a viagem existe no TMS", o que contava como pega a oferta que ainda esperava
   * decisão. Com a terceira, as três somam o total e cada uma diz o que diz: o portal confirmou,
   * não pegamos, ou está esperando alguém decidir.
   */
  esperando: number;
  tendenciaAceito: number;
  tendenciaNaoAceito: number;
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
    /** O id da oferta — é o endereço da dispensa quando alguém ignora daqui. */
    ofertaId: string;
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
    /** A viagem é de amanhã em diante — esta linha alimenta a TENDÊNCIA, não o SPOT. */
    tendencia: boolean;
    /** O dia da viagem (ISO `YYYY-MM-DD`), quando deu para ler o STA. A tela mostra dia e mês. */
    diaDaViagem: string | null;

    /**
     * EM QUE PÉ ESTÁ A DECISÃO — derivado pela MESMA função que a leitura do cartão usa.
     *
     * Diferente da leitura do cartão, aqui `aceito` APARECE: este cartão é o registro do dia e
     * precisa mostrar o que foi aceito. Lá a oferta aceita some, porque a lista é a fila do que
     * falta decidir. A assimetria é deliberada — uniformizar as duas quebraria o FR-014.
     */
    estado: EstadoDaOferta;
    /** A viagem no TMS, quando existe. É o endereço da ordem que a ação da linha manda. */
    tripId: string | null;
    aceitacaoDoPortal: string | null;
    ordemAberta: boolean;
    ultimaFalhou: boolean;
    /**
     * QUEM ignorou esta oferta pela equipe, ou nulo (2026-09-01).
     *
     * Era `dispensadaPorMim: boolean`, de quando ignorar limpava só a tela de quem clicava. Com a
     * decisão valendo para todos, o booleano deixou de bastar: a pergunta que a linha responde
     * passou a ser "quem decidiu que a gente não pega?".
     *
     * Só MARCA — a linha continua listada, porque este cartão é o registro do dia e ignorar não
     * apaga a prova de que a oferta chegou.
     */
    ignoradaPor: string | null;
    /** O que a pessoa escreveu ao ignorar. Nulo é comum: o campo é opcional de propósito. */
    motivoDoDescarte: string | null;
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
/**
 * O DIA DA VIAGEM DA OFERTA, tirado do STA da origem (2026-08-28, a pedido).
 *
 * É o corte que separa SPOT de TENDÊNCIA: oferta cuja viagem é HOJE é spot; para o dia 28, 29 em
 * diante é tendência. Quem manda é a data da VIAGEM, não a hora em que a oferta chegou — a mesma
 * oferta pode chegar hoje de manhã falando de uma carga de quinta.
 *
 * ── O CAMPO TEM TRÊS FORMATOS, e ignorar isso zeraria a coluna em silêncio ────────────────────
 *
 * `origin_arrival` é texto e o robô já escreveu de dois jeitos, mais o vazio. Medido no banco:
 *
 *   ISO     2026-08-28T06:00:00.000Z    24 ofertas, recebidas de 25/08 em diante — é o formato de hoje
 *   BR      19/08/2026, 12:56:54        44 ofertas, de 19/08 a 24/08 — o formato antigo
 *   vazio   (nulo)                      28 ofertas, de 18/08 a 25/08 — pararam em 25/08
 *
 * Ler só o ISO daria certo hoje e erraria calado no dia em que o robô voltasse atrás. Os dois
 * formatos custam um `case` e compram essa garantia.
 *
 * O `regexp` decide o formato antes de qualquer conversão de propósito: um `::timestamptz` no
 * texto brasileiro não devolve nulo, ele ERRA A CONSULTA INTEIRA — foi assim que este campo se
 * anunciou (`date/time field value out of range: "19/08/2026, 12:56:54"`).
 */
const diaDaViagem = sql`(case
  when s.origin_arrival ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
    then (s.origin_arrival::timestamptz at time zone 'America/Sao_Paulo')::date
  when s.origin_arrival ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}'
    then to_date(left(s.origin_arrival, 10), 'DD/MM/YYYY')
  else null
end)`;

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
export async function readSpotPorRegiao(
  /**
   * Quem está olhando — só para MARCAR a linha que essa pessoa ignorou (2026-09-01).
   *
   * Opcional, e ausente significa que nada é marcado. Diferente da leitura do cartão, que ESCONDE o
   * dispensado: aqui ele fica listado e aceitável, porque este cartão é o registro do dia.
   */
  userId?: string | null,
): Promise<SpotDaRegiao[]> {
  const linhas = await db.execute<{
    region: string | null;
    aceito: string;
    nao_aceito: string;
    esperando: string;
    tendencia_aceito: string;
    tendencia_nao_aceito: string;
    rotas: LinhaCrua[] | null;
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
        s.id as oferta_id,
        s.portal_trip_id,
        s.route,
        s.received_at,
        s.trip_number,
        s.price,
        s.origin_arrival,
        s.vehicle,
        /*
         * TENDÊNCIA É O QUE VEM DEPOIS DE HOJE. Todo o resto é spot — inclusive a viagem que já
         * passou e a oferta sem data, decidido assim a pedido (28/08).
         *
         * Escrito como "é futuro?" e não como "é hoje?" de propósito: assim o nulo cai no lado
         * seguro sem precisar de uma terceira condição. Oferta que não dá para datar continua
         * aparecendo no spot em vez de sumir das duas colunas.
         */
        ${diaDaViagem} as dia_da_viagem,
        (${diaDaViagem} > (now() at time zone 'America/Sao_Paulo')::date) is true as tendencia,
        ${chaveDaEstacao(sql`trim(split_part(s.route, '->', 1))`)} as chave
      from spot_offers s
      where s.received_at > now() - interval '24 hours'
    )
    select
      e.region::text as region,
      /*
       * "ACEITA" PASSOU A SIGNIFICAR ACEITA (2026-09-01, fatia 030) — e antes não significava.
       *
       * A conta era "t.id is not null": A VIAGEM EXISTE NO TMS. É um atalho, e ele erra exatamente
       * na janela que esta fatia inteira habita — os minutos entre a viagem chegar e alguém decidir
       * sobre ela, em que ela está no TMS e ainda espera decisão no portal.
       *
       * Por que ninguém notou: o erro é PASSAGEIRO. Medido em 01/09, das 98 ofertas que casaram com
       * viagem, 98 estão "Accepted" hoje — o atalho coincide com a verdade DEPOIS, e não DURANTE.
       * Um painel que só é conferido no fim do dia nunca mostra a diferença.
       *
       * Agora são três contas e não duas, e elas somam o total: aceita (o portal confirmou), não
       * aceita (não há viagem — não pegamos) e esperando (há viagem e ela ainda espera decisão).
       * Sem a terceira, a oferta que espera teria de mentir em uma das outras duas.
       */
      count(*) filter (where not o.tendencia and t.aceitacao = ${ACEITACAO_ACEITA}) as aceito,
      count(*) filter (where not o.tendencia and t.id is null)                      as nao_aceito,
      count(*) filter (
        where not o.tendencia and t.id is not null and t.aceitacao is distinct from ${ACEITACAO_ACEITA}
      ) as esperando,
      -- TENDÊNCIA: a viagem é de amanhã em diante, sem teto de dias.
      count(*) filter (where o.tendencia and t.aceitacao = ${ACEITACAO_ACEITA}) as tendencia_aceito,
      count(*) filter (where o.tendencia and t.id is null)                      as tendencia_nao_aceito,
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
            'ofertaId', o.oferta_id,
            'rota', o.route,
            'aceito', t.aceitacao = ${ACEITACAO_ACEITA},
            'lh', o.trip_number,
            'hora', o.received_at,
            'preco', o.price,
            'sta', o.origin_arrival,
            'veiculo', o.vehicle,
            /*
             * AS ENTRADAS DA DERIVAÇÃO, cruas — a linha NÃO decide o estado aqui (2026-09-01).
             *
             * Quem decide é "estadoDaOferta", em "packages/shared", no mapeamento abaixo. É a MESMA
             * função que a leitura do cartão usa, e é isso que garante o FR-022: a decisão vista no
             * cartão e a vista nesta linha são a mesma, e não duas que se parecem.
             *
             * Reimplementar a máquina de cinco estados em SQL seria a segunda fonte clássica: ela
             * concordaria com a primeira no dia em que fosse escrita e divergiria em silêncio no
             * primeiro ajuste — sem erro nenhum, só duas telas dizendo coisas diferentes sobre a
             * mesma oferta.
             */
            'tripId', t.id,
            'aceitacaoDoPortal', t.aceitacao,
            'ordemAberta', coalesce(t.ordem_aberta, false),
            'ultimaFalhou', t.ultimo_status = 'failed',
            'ignoradaPor', d.por,
            'motivoDoDescarte', d.motivo,
            -- A lista mostra as duas, e a marca é o que diz qual número cada linha alimenta.
            'tendencia', o.tendencia,
            'diaDaViagem', o.dia_da_viagem
          )
          order by o.received_at desc
        ) filter (where o.route is not null),
        '[]'::jsonb
      ) as rotas
    from oferta o
    left join estacao e on e.chave = o.chave
    /*
     * A VIAGEM E O QUE A DECISÃO PRECISA SABER, numa passada só.
     *
     * A chave continua sendo o "ID (portal)", e não o número da LH que a leitura do cartão usa.
     * Medido em 01/09: as duas casam com as MESMAS 98 de 132 ofertas, com ZERO divergência — então
     * nenhuma das duas foi mexida, e fica registrado que elas foram conferidas uma contra a outra.
     */
    left join lateral (
      select
        tr.id,
        tr.customer_fields ->> 'Aceitação (portal)' as aceitacao,
        exists (
          select 1 from portal_commands pc
           where pc.trip_id = tr.id and pc.action = 'accept'
             and pc.status in ('pending', 'sent')
        ) as ordem_aberta,
        (
          select pc.status from portal_commands pc
           where pc.trip_id = tr.id and pc.action = 'accept'
           order by pc.requested_at desc limit 1
        ) as ultimo_status
      from trips tr
      where (tr.customer_fields ->> 'ID (portal)') = o.portal_trip_id
      limit 1
    ) t on true
    /*
     * A DISPENSA SÓ MARCA, e não filtra — é a diferença entre esta leitura e a do cartão.
     *
     * Lá a oferta ignorada some, porque a lista é a fila do que falta decidir. Aqui ela FICA,
     * assinalada, porque este cartão é o registro do dia: ignorar não pode apagar a prova de que a
     * oferta chegou, e a linha continua podendo ser aceita (FR-019).
     */
    left join lateral (
      select true as dispensada
      from spot_offer_dispensas sd
      where sd.spot_offer_id = o.oferta_id
        and sd.user_id = ${userId ?? null}::uuid
      limit 1
    ) d on true
    group by 1
  `);

  return linhas
    .map((r) => ({
      region: r.region ?? null,
      aceito: Number(r.aceito),
      naoAceito: Number(r.nao_aceito),
      esperando: Number(r.esperando),
      tendenciaAceito: Number(r.tendencia_aceito),
      tendenciaNaoAceito: Number(r.tendencia_nao_aceito),
      /*
       * TETO DE VINTE, porque isto viaja no payload do painel inteiro — que recarrega de minuto em
       * minuto, numa TV que fica ligada o dia todo.
       *
       * Vinte cobre folgado o pior dia medido. O corte é aqui e não no SQL de propósito: a CONTAGEM
       * acima continua sendo do total, e um número que discordasse da lista embaixo dele seria pior
       * que lista nenhuma.
       */
      /*
       * O ESTADO DE CADA LINHA SAI AQUI, com a MESMA função que a leitura do cartão usa.
       *
       * É o FR-022 garantido por construção: as duas telas não têm como discordar, porque só existe
       * uma implementação da regra. A alternativa — repetir a máquina de cinco estados no SQL —
       * concordaria no dia em que fosse escrita e divergiria em silêncio no primeiro ajuste.
       */
      rotas: (Array.isArray(r.rotas) ? r.rotas : []).slice(0, 20).map((l) => ({
        ...l,
        estado: estadoDaOferta({
          tripId: l.tripId,
          aceitacaoDoPortal: l.aceitacaoDoPortal,
          ordemAberta: Boolean(l.ordemAberta),
          ultimaFalhou: Boolean(l.ultimaFalhou),
        }),
      })),
    }))
    .sort((a, b) => regionPosition(a.region) - regionPosition(b.region));
}

/** A linha como o SQL a devolve: com as ENTRADAS da derivação, ainda sem o estado. */
type LinhaCrua = Omit<SpotDaRegiao["rotas"][number], "estado">;
