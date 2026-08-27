import { sql } from "drizzle-orm";
import { db } from "../client";

/**
 * AS PLACAS QUE ESTE MOTORISTA JÁ RODOU (2026-08-27, a pedido).
 *
 * No diálogo de atribuição, escolher o motorista e depois caçar a placa é o passo onde o erro
 * entra: são 936 placas na lista, e a certa quase sempre é uma que ele já usou na semana passada.
 * Isto responde "quais?" sem que ninguém precise lembrar.
 *
 * ── DE ONDE SAI: AS VIAGENS DO PORTAL, E TAMBÉM AS NOSSAS ORDENS ─────────────────────────────
 *
 * A fonte principal é `trips.customer_fields` — o que o PORTAL diz sobre cada viagem:
 * `ID do motorista (portal)` e `Placa (portal)`. Vale para toda viagem que ele nos mostra, tenha
 * sido escalada por quem for.
 *
 * ── A PRIMEIRA VERSÃO LIA SÓ `portal_commands`, E ESTAVA ERRADA (consertado em 27/08) ─────────
 *
 * O raciocínio parecia bom: a ordem que NÓS demos é o registro mais direto do que foi escalado, e
 * `customer_fields` é o que o portal devolve — às vezes diferente, e a divergência entre os dois é
 * o que a aba GR vigia.
 *
 * O que esse raciocínio esqueceu é que `portal_commands` é a nossa CAIXA DE SAÍDA. Ela só tem as
 * atribuições que o TMS mandou, e atribuir pelo TMS existe desde 21/08. Todo motorista escalado
 * por uma pessoa direto no portal — que é a maioria do histórico — não tinha linha nenhuma ali.
 *
 * O sintoma foi o usuário quem viu: "tem vários motoristas que não está mostrando as últimas
 * placas, mesmo ele em viagem". Motorista EM VIAGEM e sem sugestão nenhuma é a assinatura exata de
 * uma fonte que só enxerga o que passou por nós.
 *
 * ── AS ORDENS FICAM, COMO COMPLEMENTO ────────────────────────────────────────────────────────
 *
 * Uma atribuição que o TMS acabou de mandar ainda não voltou em `customer_fields` — o portal leva
 * um tempo para refletir. Somar as duas fontes cobre a ponta recente sem perder o histórico.
 *
 * A contagem é por VIAGEM DISTINTA justamente por isso: quando as duas fontes têm a mesma viagem,
 * ela conta uma vez. Sem isso, toda viagem atribuída pelo TMS valeria dobrado e a ordem por
 * frequência mentiria a favor das mais recentes.
 *
 * ── É SUGESTÃO, E O CHAMADOR PRECISA TRATAR COMO TAL ──────────────────────────────────────────
 *
 * Nada aqui decide nada. A tela mostra, a pessoa clica se quiser. Preencher sozinho seria pior que
 * não sugerir: o caminhão de ontem não é o caminhão de hoje, e um campo que se preenche sozinho é
 * um campo que ninguém confere.
 */

export interface PlacaDoMotorista {
  placa: string;
  /** Quantas vezes ele foi escalado com ela — a frequência é o que separa a rotina da exceção. */
  vezes: number;
  /** Quando foi a última, em ISO. A tela formata. */
  ultimaEm: string | null;
  /** A rota da última vez, para a placa vir com contexto em vez de sozinha. */
  ultimaRota: string | null;
}

/**
 * As placas mais recentes, das mais usadas para as menos.
 *
 * ── A JANELA É DE 90 DIAS ─────────────────────────────────────────────────────────────────────
 *
 * Curta demais e um motorista que voltou de férias aparece sem nada; longa demais e a lista traz o
 * caminhão que ele largou em março. Noventa dias é o mesmo recorte que a varredura de coordenadas
 * usa para decidir o que é estação ativa — vale a mesma intuição sobre o que ainda é presente.
 *
 * ── E ELE CONTA COMO PRIMEIRO **OU** SEGUNDO MOTORISTA ────────────────────────────────────────
 *
 * Numa dupla, o segundo dirige o mesmo caminhão. Olhar só `driver_id` esconderia metade do
 * histórico de quem costuma rodar acompanhado — e justamente nas viagens longas, que são as que
 * repetem placa.
 */
const EH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ACEITA AS DUAS CHAVES DE MOTORISTA QUE O TMS TEM, e é preciso que aceite.
 *
 * O diálogo do PORTAL (Expedição, Minha Programação) trabalha com o id numérico do portal, porque é
 * ele que o portal aceita numa ordem. A atribuição INTERNA (Torre de Controle) trabalha com o UUID
 * do nosso cadastro, porque é ela que grava em `trip_assignments`.
 *
 * São mecanismos diferentes de propósito — um manda ordem ao cliente, o outro registra escala nossa
 * — e a mesma pergunta ("que placas este motorista já rodou?") vale nos dois. Fazer duas funções
 * seria duplicar a consulta inteira para trocar uma cláusula.
 *
 * O UUID é resolvido para o id do portal via `drivers.portal_driver_id`, que é o mesmo vínculo que a
 * fila da GR usa. Motorista do nosso cadastro que nunca apareceu no portal não tem histórico de
 * ordem — e devolver vazio é a resposta certa, não um erro.
 */
export async function placasDoMotorista(
  chaveDoMotorista: string,
  limite = 5,
): Promise<PlacaDoMotorista[]> {
  let id = chaveDoMotorista.trim();

  if (EH_UUID.test(id)) {
    const linhas = await db.execute<{ portal_driver_id: string | null }>(
      sql`select portal_driver_id from drivers where id = ${id} limit 1`,
    );
    id = (linhas[0]?.portal_driver_id ?? "").trim();
  }

  if (!/^\d+$/.test(id)) return [];

  const linhas = await db.execute<{
    placa: string;
    vezes: string;
    ultima_em: string | null;
    ultima_rota: string | null;
  }>(sql`
    /*
     * FONTE 1 — O QUE O PORTAL DIZ DE CADA VIAGEM.
     *
     * Vale para toda viagem que ele nos mostra, escalada por quem for. É a fonte que faltava: sem
     * ela, só apareciam os motoristas que o proprio TMS tinha atribuido.
     *
     * A janela é pela COLETA PLANEJADA, e nao pela criacao da viagem: e quando ele dirigiu.
     */
    with do_portal as (
      select
        t.id                            as trip_id,
        t.planned_pickup_window_start   as quando,
        t.customer_fields ->> 'Placa (portal)' as placas
        from trips t
       where (t.customer_fields ->> 'ID do motorista (portal)') = ${id}
         and t.planned_pickup_window_start > now() - interval '90 days'
    ),
    /*
     * FONTE 2 — AS ORDENS QUE NOS MANDAMOS, como complemento.
     *
     * Uma atribuicao que o TMS acabou de mandar ainda nao voltou em customer_fields: o portal leva
     * um tempo para refletir. Sem esta fonte, a placa que a pessoa escalou ha dez minutos sumiria da
     * sugestao ate o proximo ciclo do robo.
     *
     * Aqui o motorista conta como primeiro OU segundo: numa dupla o segundo dirige o mesmo caminhao.
     */
    das_ordens as (
      select
        pc.trip_id                      as trip_id,
        pc.settled_at                   as quando,
        pc.plates                       as placas
        from portal_commands pc
       where pc.action = 'assign'
         and pc.status = 'done'
         and pc.settled_at > now() - interval '90 days'
         and (pc.driver_id::text = ${id} or pc.second_driver_id::text = ${id})
    ),
    tudo as (
      select * from do_portal
      union all
      select * from das_ordens
    ),
    /*
     * UMA VIAGEM PODE CARREGAR VARIAS PLACAS — "ABC1D23,XYZ9W88" e cavalo mais carreta.
     *
     * A limpeza tira tudo que nao e letra, numero ou virgula ANTES de partir: a virgula sobrevive
     * porque e ela que separa: e o hifen some, porque a mesma placa aparece como ABC-1D23 num lado e
     * ABC1D23 no outro. Sem isso as duas grafias virariam duas placas diferentes na contagem.
     */
    abertas as (
      select
        btrim(p)                        as placa,
        x.quando,
        x.trip_id
        from tudo x,
             unnest(string_to_array(
               upper(regexp_replace(coalesce(x.placas, ''), '[^A-Za-z0-9,]', '', 'g')), ','
             )) as p
       where btrim(p) <> ''
    )
    select
      a.placa,
      /*
       * POR VIAGEM DISTINTA, e nao por linha.
       *
       * As duas fontes se sobrepoem: uma viagem atribuida pelo TMS aparece nas duas assim que o
       * portal reflete. Contar linhas faria ela valer dobrado, e a ordem por frequencia mentiria a
       * favor das viagens mais recentes — justamente as que menos provam habito.
       */
      count(distinct a.trip_id)::text   as vezes,
      max(a.quando)::text               as ultima_em,
      /* A rota da ULTIMA vez, para a placa vir com contexto em vez de sozinha. */
      (
        select o.name || ' -> ' || d.name
          from trips t2
          join locations o on o.id = t2.origin_location_id
          join locations d on d.id = t2.destination_location_id
         where t2.id = (
                 select a2.trip_id from abertas a2
                  where a2.placa = a.placa
                  order by a2.quando desc nulls last
                  limit 1
               )
         limit 1
      )                                 as ultima_rota
      from abertas a
     group by a.placa
     /*
      * Ordenado por FREQUENCIA primeiro e recencia depois.
      *
      * A placa que ele rodou doze vezes e a dele; a que rodou uma vez foi um quebra-galho. Ordenar
      * so por recencia poria o quebra-galho de ontem na frente do caminhao de sempre — e o primeiro
      * item de uma lista de sugestoes e o que as pessoas clicam.
      */
     order by count(distinct a.trip_id) desc, max(a.quando) desc nulls last
     limit ${limite}
  `);

  return linhas.map((r) => ({
    placa: r.placa,
    vezes: Number(r.vezes ?? 0),
    ultimaEm: r.ultima_em,
    ultimaRota: r.ultima_rota,
  }));
}
