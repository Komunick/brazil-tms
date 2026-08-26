import { sql } from "drizzle-orm";
import { db } from "../client";

/**
 * A COORDENADA DAS ESTAÇÕES — ler o que falta, gravar o que se deduziu (2026-08-26, a pedido).
 *
 * O porquê e a precisão estão em `@brazil-tms/shared` → `coordenada-de-rota.ts`. Em resumo: sai do
 * KML das rotas da gerenciadora, tem precisão de CIDADE, e isso basta para ordenar veículos por
 * distância — um erro de oito quilômetros na origem não reordena caminhões que estão a 25, 39 e 122.
 */

export interface EstacaoSemCoordenada {
  id: string;
  nome: string;
  /** A chave `UF CIDADE`, para casar com a cidade que a gerenciadora escreve na rota. */
  chave: string;
  /** Quantas viagens saíram dela nos últimos 90 dias. É o que decide a ordem da varredura. */
  viagens: number;
}

/**
 * As estações que PRECISAM de coordenada, das que mais rodam para as que menos.
 *
 * ── A ORDEM É POR VOLUME, e é o que faz a varredura valer desde o primeiro minuto ─────────────
 *
 * Medido em 26/08: as cinco estações de origem mais movimentadas somam 1.384 viagens em 30 dias —
 * mais que as outras 47 juntas. Varrendo por volume, cinco chamadas (menos de um minuto de job) já
 * cobrem o grosso do dia. Alfabética ou por id desperdiçaria as primeiras chamadas em estações que
 * quase não aparecem.
 *
 * ── SÓ AS QUE SÃO ORIGEM ──────────────────────────────────────────────────────────────────────
 *
 * São 459 estações cadastradas e só ~52 aparecem como origem de viagem. A coordenada serve para
 * responder "quem está perto da COLETA": destino não entra nessa conta, e varrer os 459 gastaria
 * setenta minutos de job para preencher campos que ninguém lê.
 */
export async function estacoesSemCoordenada(limite = 100): Promise<EstacaoSemCoordenada[]> {
  const linhas = await db.execute<{ id: string; nome: string; viagens: string }>(sql`
    select l.id, l.name as nome, count(*)::text as viagens
      from trips t
      join locations l on l.id = t.origin_location_id
     where t.planned_pickup_window_start > now() - interval '90 days'
       and l.archived_at is null
       and l.latitude is null
     group by l.id, l.name
     order by count(*) desc
     limit ${limite}
  `);
  return linhas.map((r) => ({
    id: r.id,
    nome: r.nome,
    chave: "",
    viagens: Number(r.viagens ?? 0),
  }));
}

/**
 * Grava a coordenada deduzida — e NUNCA por cima de uma marcada à mão.
 *
 * ── A GUARDA `coordenada_origem IS DISTINCT FROM 'manual'` É O PONTO ──────────────────────────
 *
 * Sem ela, a varredura desfaria toda correção humana no ciclo seguinte. E o defeito apareceria como
 * "a coordenada volta sozinha para o lugar errado" — um sintoma que não aponta para causa nenhuma,
 * e que levaria horas para alguém ligar ao job.
 *
 * `IS DISTINCT FROM` e não `<>`: com `<>`, a linha cujo `coordenada_origem` é `null` (a esmagadora
 * maioria, que é justamente quem queremos preencher) daria `null` na comparação e seria pulada.
 * Seria um job que nunca grava nada, sem erro nenhum.
 */
export async function gravarCoordenadaDaEstacao(
  locationId: string,
  lat: number,
  lon: number,
): Promise<boolean> {
  const linhas = await db.execute<{ id: string }>(sql`
    update locations
       set latitude = ${lat},
           longitude = ${lon},
           coordenada_origem = 'logae_rota',
           coordenada_em = now()
     where id = ${locationId}
       and coordenada_origem is distinct from 'manual'
    returning id
  `);
  return linhas.length > 0;
}

/**
 * A coordenada marcada por uma PESSOA. Sobrescreve qualquer coisa, inclusive outra manual.
 *
 * É o conserto pontual: para o dia em que uma estação estiver visivelmente fora do lugar no mapa e
 * alguém quiser acertar. Não é tarefa de cadastro — a varredura preenche sozinha, e isto conserta.
 */
export async function marcarCoordenadaAMao(
  locationId: string,
  lat: number,
  lon: number,
): Promise<void> {
  await db.execute(sql`
    update locations
       set latitude = ${lat}, longitude = ${lon},
           coordenada_origem = 'manual', coordenada_em = now()
     where id = ${locationId}
  `);
}

export interface EstacaoComCoordenada {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  origem: string | null;
}

/** As estações que JÁ têm coordenada — para a tela do mapa e para a conta de distância. */
export async function estacoesComCoordenada(): Promise<EstacaoComCoordenada[]> {
  const linhas = await db.execute<{
    id: string;
    nome: string;
    latitude: number;
    longitude: number;
    coordenada_origem: string | null;
  }>(sql`
    select id, name as nome, latitude, longitude, coordenada_origem
      from locations
     where archived_at is null and latitude is not null and longitude is not null
     order by name
  `);
  return linhas.map((r) => ({
    id: r.id,
    nome: r.nome,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    origem: r.coordenada_origem,
  }));
}
