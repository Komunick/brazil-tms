import { sql } from "drizzle-orm";
import { db } from "../client";

/**
 * AS PLACAS QUE ESTE MOTORISTA JÁ RODOU (2026-08-27, a pedido).
 *
 * No diálogo de atribuição, escolher o motorista e depois caçar a placa é o passo onde o erro
 * entra: são 936 placas na lista, e a certa quase sempre é uma que ele já usou na semana passada.
 * Isto responde "quais?" sem que ninguém precise lembrar.
 *
 * ── DE ONDE SAI ───────────────────────────────────────────────────────────────────────────────
 *
 * Das ordens de atribuição que o TMS já mandou ao portal — `portal_commands` com `action = assign`
 * e `status = done`. É o registro do que de fato foi escalado, não de uma intenção: uma ordem
 * `done` é uma ordem que o robô executou no portal do cliente.
 *
 * Não sai de `trips.customer_fields`, que também carrega placa. Aquela é a placa que o portal
 * DEVOLVE, e ela chega depois, às vezes diferente — a divergência entre as duas é justamente o que
 * a aba GR existe para vigiar. Para "o que este motorista costuma dirigir", a ordem que nós demos é
 * a fonte mais direta e a mais antiga disponível.
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
    with ordens as (
      select pc.plates, pc.settled_at, pc.trip_id
        from portal_commands pc
       where pc.action = 'assign'
         and pc.status = 'done'
         and pc.settled_at > now() - interval '90 days'
         and (pc.driver_id::text = ${id} or pc.second_driver_id::text = ${id})
    ),
    /*
     * UMA ORDEM PODE CARREGAR VÁRIAS PLACAS — "ABC1D23,XYZ9W88" é cavalo mais carreta. O
     * O unnest(string_to_array(...)) abre isso em uma linha por placa, senão o par inteiro viraria
     * uma "placa" que não existe em lugar nenhum e nunca casaria com a lista do campo.
     */
    abertas as (
      select upper(btrim(p)) as placa, o.settled_at, o.trip_id
        from ordens o,
             unnest(string_to_array(coalesce(o.plates, ''), ',')) as p
       where btrim(p) <> ''
    )
    select
      a.placa,
      count(*)::text                          as vezes,
      max(a.settled_at)::text                 as ultima_em,
      /*
       * A rota da ÚLTIMA vez, não de uma qualquer: a subconsulta ordenada por settled_at resolve isso
       * sem uma segunda passada sobre a tabela.
       */
      (
        select o.name || ' → ' || d.name
          from portal_commands pc2
          join trips t on t.id = pc2.trip_id
          join locations o on o.id = t.origin_location_id
          join locations d on d.id = t.destination_location_id
         where pc2.trip_id = (
                 select a2.trip_id from abertas a2
                  where a2.placa = a.placa
                  order by a2.settled_at desc nulls last
                  limit 1
               )
         limit 1
      )                                       as ultima_rota
      from abertas a
     group by a.placa
     /*
      * Ordenado por FREQUÊNCIA primeiro e recência depois.
      *
      * A placa que ele rodou doze vezes é a dele; a que rodou uma vez foi um quebra-galho. Ordenar
      * só por recência poria o quebra-galho de ontem na frente do caminhão de sempre — e o primeiro
      * item de uma lista de sugestões é o que as pessoas clicam.
      */
     order by count(*) desc, max(a.settled_at) desc nulls last
     limit ${limite}
  `);

  return linhas.map((r) => ({
    placa: r.placa,
    vezes: Number(r.vezes ?? 0),
    ultimaEm: r.ultima_em,
    ultimaRota: r.ultima_rota,
  }));
}
