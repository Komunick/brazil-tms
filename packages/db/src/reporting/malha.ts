import { sql } from "drizzle-orm";
import { regionPosition } from "@brazil-tms/shared";
import { db } from "../client";

/**
 * A MALHA — quais rotas a empresa de fato roda (2026-08-23, a pedido).
 *
 * ── POR QUE ISTO É CALCULADO, E NÃO CADASTRADO ────────────────────────────────────────────────
 *
 * A pergunta "esta rota é nossa?" apareceu quando 24 viagens acenderam o alarme do painel e o
 * usuário reconheceu, pela rota, que nenhuma era trabalho da empresa. Fomos procurar o cadastro
 * dessa resposta e ele não existe: o portal do cliente só mostra à transportadora as VIAGENS e uma
 * configuração de seis "rotas expressas" (as de longa distância com troca de motorista). A
 * programação que decide quem roda o quê fica do lado da Shopee.
 *
 * A planilha da operação também não fecha a conta sozinha: ela lista a ESTAÇÃO de origem, e origem
 * sozinha não distingue. As 16 viagens reprovadas pelo usuário saíam de São Bernardo, Santana e
 * Guarulhos — três estações nossas. O que as separava era o PAR: nenhuma daquelas combinações
 * origem → destino jamais tinha rodado aqui.
 *
 * Então a malha sai da única fonte que a empresa tem em mãos e que não depende de ninguém: o que
 * ela executou. Par com viagem que chegou à origem, rodou ou terminou é rota nossa, com prova.
 *
 * ── E POR QUE ISTO NÃO PODE VIRAR REGRA AUTOMÁTICA ────────────────────────────────────────────
 *
 * Porque olha para trás. Rota nova nunca rodou — se "já rodamos" virasse filtro de entrada, a rota
 * nova seria barrada por ser nova, e nunca sairia de nova. O critério se provaria sozinho e a
 * empresa pararia de crescer sem ninguém perceber. Esta consulta ALIMENTA uma tela de conferência;
 * quem decide continua sendo gente.
 *
 * É por isso que os pares nunca rodados vêm juntos, e não filtrados fora: é ali que a rota nova
 * aparece para ser reconhecida.
 */

export interface RotaDaMalha {
  origem: string;
  destino: string;
  /** A frente da estação de ORIGEM — a mesma regra dos cartões do painel. `null` = sem cadastro. */
  region: string | null;
  /** Viagens que apareceram para este par, em qualquer estado. */
  viagens: number;
  /** Quantas dessas de fato saíram do papel. Zero = nunca rodamos este par. */
  rodadas: number;
  /** Data da coleta da última que rodou (`null` quando nenhuma rodou). */
  ultimaRodada: string | null;
  /** Data da coleta da última vista, tenha rodado ou não. */
  ultimaVista: string | null;
}

/**
 * "RODOU" É O MARCO, NÃO O STATUS ATUAL — a lista dos status que provam movimento.
 *
 * Uma viagem concluída, faturada ou em disputa passou pela estrada; uma `received` ou `assigned`
 * pode nunca ter saído. `at_origin` entra porque o caminhão chegou à origem: a rota foi operada,
 * mesmo que a viagem morra depois. Cancelada NÃO entra — cancelar é o oposto de ter rodado.
 */
const RODOU = sql`t.current_status in
  ('at_origin', 'in_transit', 'at_destination', 'completed', 'billing_pending', 'billed', 'disputed')`;

export async function readMalhaDeRotas(): Promise<RotaDaMalha[]> {
  const linhas = await db.execute<{
    origem: string;
    destino: string;
    region: string | null;
    viagens: string;
    rodadas: string;
    ultima_rodada: string | null;
    ultima_vista: string | null;
  }>(sql`
    select
      lo.name as origem,
      ld.name as destino,
      lo.region::text as region,
      count(*) as viagens,
      count(*) filter (where ${RODOU}) as rodadas,
      to_char(
        max(t.planned_pickup_window_start) filter (where ${RODOU})
          at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') as ultima_rodada,
      to_char(
        max(t.planned_pickup_window_start) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') as ultima_vista
    from trips t
    join locations lo on lo.id = t.origin_location_id
    join locations ld on ld.id = t.destination_location_id
    group by 1, 2, 3
  `);

  return (
    linhas
      .map((r) => ({
        origem: r.origem,
        destino: r.destino,
        region: r.region ?? null,
        viagens: Number(r.viagens),
        rodadas: Number(r.rodadas),
        ultimaRodada: r.ultima_rodada,
        ultimaVista: r.ultima_vista,
      }))
      /**
       * A ordem é a da tela: primeiro a frente (como no painel), depois o que mais rodou. Quem abre
       * isto está conferindo a própria malha, e conferir é ler de cima para baixo — a rota de 234
       * viagens antes da de uma.
       */
      .sort(
        (a, b) =>
          regionPosition(a.region) - regionPosition(b.region) ||
          b.rodadas - a.rodadas ||
          b.viagens - a.viagens ||
          a.origem.localeCompare(b.origem, "pt-BR"),
      )
  );
}
