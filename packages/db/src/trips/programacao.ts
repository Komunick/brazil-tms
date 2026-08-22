import { sql } from "drizzle-orm";
import { ACEITACAO_PENDENTE, regionPosition } from "@brazil-tms/shared";
import { db } from "../client";

/**
 * A PROGRAMAÇÃO POR FRENTE — o quadro branco da sala, em tela (2026-08-22, a pedido).
 *
 * O desenho veio de uma foto de quadro branco: cada frente numa linha, e quatro blocos abrindo para
 * o lado. Ele responde uma pergunta por bloco, e a ordem é a do trabalho:
 *
 *   PLAN      o que está contratado e vem aí — nas próximas 12h e 24h
 *   SPOT      o que apareceu em leilão nessa frente, e o que a empresa pegou
 *   ORIGEM    quem já devia ter caminhão na origem e não tem  ← o alarme
 *   TENDÊNCIA para onde a frente está indo: quanto já é compromisso e quanto ainda é proposta
 *
 * ── POR QUE POR FRENTE, E POR QUE PELA ORIGEM ──────────────────────────────────────────────────
 *
 * A operação é dividida em três frentes e quem cuida de uma não consegue ler o número somado. A
 * região é a da ESTAÇÃO DE ORIGEM, como no resto do painel: um LH liga duas pontas que podem estar
 * em regiões diferentes, e a planilha do cliente titula a coluna "ESTAÇÃO ORIGEM".
 *
 * Estação sem região vira uma frente própria em vez de sumir — e isso não é preciosismo. Medido no
 * dia em que este arquivo nasceu: das 27 viagens com origem atrasada, NOVE estavam em estação sem
 * região. Um terço do alarme desapareceria da tela sem ninguém desconfiar.
 */

export interface BlocoDaFrente {
  /** `null` = estação ainda sem região cadastrada. */
  region: string | null;
  /** PLAN: viagens com coleta nas próximas 12h e 24h, ainda sem sair. */
  plan12h: number;
  plan24h: number;
  /** SPOT: ofertas que apitaram nesta frente nas últimas 24h, e o que virou trabalho nosso. */
  spotAceito: number;
  spotNaoAceito: number;
  /** ORIGEM: já passou de coleta−2h e o caminhão não chegou. É o número que pisca. */
  origemAtrasada: number;
  /** TENDÊNCIA: tudo que a frente tem pela frente, separado por decisão do cliente. */
  tendenciaAceito: number;
  tendenciaNaoAceito: number;
}

/**
 * A ANTECEDÊNCIA EXIGIDA NA ORIGEM — duas horas, por regra da operação.
 *
 * O portal manda a hora exigida por viagem (e ela nem sempre é duas: medido nas ofertas de spot,
 * aparece 1h e 2h), mas hoje só capturamos esse campo nas ofertas. Enquanto o robô leitor não o
 * trouxer para todas as viagens, a régua é a regra do negócio.
 *
 * Quando vier, troca-se ESTA constante por uma coluna e o resto do arquivo não muda.
 */
const HORAS_DE_ANTECEDENCIA = 2;

/**
 * Por quanto tempo uma viagem atrasada continua piscando depois da hora da coleta.
 *
 * Um dia. Sem isto, a viagem sairia do quadro no PIOR momento: às 10:00 ela vira "atrasada", e às
 * 10:01 — quando o prazo de coleta também passa — ela desapareceria se o recorte fosse só "coleta no
 * futuro". Alarme que some sozinho ensina a não olhar o quadro.
 *
 * O corte em 24h existe porque depois disso não é mais atraso, é viagem morta que ninguém encerrou —
 * problema real, mas outro, e que entupiria este.
 */
const DIAS_QUE_O_ALARME_DURA = 1;

export async function readProgramacao(): Promise<BlocoDaFrente[]> {
  /**
   * UMA consulta para os três blocos que saem de `trips`, e não três.
   *
   * Os três recortam a mesma tabela pelas mesmas junções — só mudam o `filter`. Separá-los seria
   * varrer `trips` três vezes para responder perguntas sobre as mesmas linhas.
   *
   * O RECORTE É `current_status in (received, assigned)`, e isso quer dizer "ainda não chegou na
   * origem" — verificado, não suposto: nenhuma viagem com marco de chegada continua num desses
   * dois status, e não existe viagem em at_origin sem marco. Os dois contam a mesma história,
   * então o status basta: sem cruzar a tabela de eventos, sem GPS, sem coordenada de estação.
   */
  const dasViagens = await db.execute<{
    region: string | null;
    plan12h: string;
    plan24h: string;
    origem_atrasada: string;
    tendencia_aceito: string;
    tendencia_nao_aceito: string;
  }>(sql`
    select
      lo.region::text as region,
      count(*) filter (
        where t.planned_pickup_window_start between now() and now() + interval '12 hours'
      ) as plan12h,
      count(*) filter (
        where t.planned_pickup_window_start between now() and now() + interval '24 hours'
      ) as plan24h,
      count(*) filter (
        where now() > t.planned_pickup_window_start - make_interval(hours => ${HORAS_DE_ANTECEDENCIA})
          and t.planned_pickup_window_start > now() - make_interval(days => ${DIAS_QUE_O_ALARME_DURA})
      ) as origem_atrasada,
      count(*) filter (
        where t.planned_pickup_window_start >= now()
          and (t.customer_fields ->> 'Aceitação (portal)') is distinct from ${ACEITACAO_PENDENTE}
      ) as tendencia_aceito,
      count(*) filter (
        where t.planned_pickup_window_start >= now()
          and (t.customer_fields ->> 'Aceitação (portal)') is not distinct from ${ACEITACAO_PENDENTE}
      ) as tendencia_nao_aceito
    from trips t
    left join locations lo on lo.id = t.origin_location_id
    -- received e assigned = ainda não chegou na origem. Ver o comentário acima da consulta.
    where t.current_status in ('received', 'assigned')
    group by 1
  `);

  /**
   * O SPOT VEM DE OUTRA TABELA e por outro caminho, porque oferta não é viagem.
   *
   * A oferta guarda a rota como texto (`SoC_BA_Simoes Filho  ->  LM Hub_BA_Simões Filho`), então a
   * frente sai do NOME da estação de origem casado com o cadastro. Oferta de estação que não é nossa
   * fica de fora — e isso é correto: rota que a empresa não roda não é trabalho dela.
   *
   * "Aceita" é a oferta que VIROU VIAGEM: quando alguém pega no portal, ela aparece na leitura
   * seguinte com o mesmo id. Não há campo de aceite na oferta, e não precisa haver — a existência da
   * viagem é a prova mais forte que existe.
   */
  const doSpot = await db.execute<{
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

  const porRegiao = new Map<string | null, BlocoDaFrente>();
  const vazio = (region: string | null): BlocoDaFrente => ({
    region,
    plan12h: 0,
    plan24h: 0,
    spotAceito: 0,
    spotNaoAceito: 0,
    origemAtrasada: 0,
    tendenciaAceito: 0,
    tendenciaNaoAceito: 0,
  });
  const bloco = (region: string | null): BlocoDaFrente => {
    const existente = porRegiao.get(region);
    if (existente) return existente;
    const novo = vazio(region);
    porRegiao.set(region, novo);
    return novo;
  };

  for (const linha of dasViagens) {
    const b = bloco(linha.region ?? null);
    b.plan12h = Number(linha.plan12h);
    b.plan24h = Number(linha.plan24h);
    b.origemAtrasada = Number(linha.origem_atrasada);
    b.tendenciaAceito = Number(linha.tendencia_aceito);
    b.tendenciaNaoAceito = Number(linha.tendencia_nao_aceito);
  }
  for (const linha of doSpot) {
    const b = bloco(linha.region ?? null);
    b.spotAceito = Number(linha.aceito);
    b.spotNaoAceito = Number(linha.nao_aceito);
  }

  /**
   * A ordem é DECLARADA, nunca alfabética — num quadro de parede a posição é como as pessoas acham a
   * frente delas, e ela não pode mudar porque uma região nova começa com "A". Sem região vai por
   * último: é pendência de cadastro, não uma frente da operação.
   */
  return [...porRegiao.values()].sort(
    (a, b) =>
      regionPosition(a.region) - regionPosition(b.region) ||
      String(a.region).localeCompare(String(b.region)),
  );
}
