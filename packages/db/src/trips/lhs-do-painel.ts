import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "../client";
import { locations, trips } from "../../schema";
import { lateToAssignSql, origemAtrasadaSql, origemRiscoSql } from "./atrasos";

/**
 * QUAIS LH ESTÃO POR TRÁS DO NÚMERO (2026-08-27, a pedido).
 *
 * O card da frente mostra contagens, e "3 pendentes de atribuição" não diz QUAIS — quem opera
 * reconhece a viagem pelo código, e é o código que permite ir atrás dela. Clicar no número abre a
 * lista ali mesmo.
 *
 * ── POR QUE SOB DEMANDA, E NÃO NO PAYLOAD DO PAINEL ───────────────────────────────────────────
 *
 * As rotas do spot viajam junto porque são poucas linhas por frente e ninguém as pagina. As LH não:
 * um número de três dígitos numa frente movimentada traria centenas de códigos, em três frentes, a
 * cada minuto de recarga — para uma lista que quase sempre ninguém abre.
 *
 * ── E POR QUE ELA REPETE O PREDICADO EM VEZ DE CHAMAR A LISTA DO QUADRO ───────────────────────
 *
 * Não repete: as duas medidas da origem usam `origemAtrasadaSql` e `origemRiscoSql`, os MESMOS
 * predicados que contam o número no painel e que filtram o quadro. É a regra de sempre neste
 * repositório — o número e a lista que ele abre têm de ser a mesma coisa, e a única forma de
 * garantir isso é uma escrita só.
 */

/**
 * As medidas que abrem lista.
 *
 * O spot não entra: ele deixou de ser coluna e virou card próprio, onde as rotas já estão à vista
 * sem clique nenhum.
 */
export type MedidaDoPainel = "pend" | "pendD1" | "pendD2" | "atribuida" | "atrasada" | "risco" | "fora";

export interface LhDoPainel {
  lh: string | null;
  origem: string | null;
  destino: string | null;
  /** A coleta planejada, em ISO. A tela formata em São Paulo. */
  quando: string | null;
}

/**
 * O ESTADO DE EXIBIÇÃO, em SQL.
 *
 * Espelha `displayStatusOf` (shared, sob teste) e o `displayStatusSql` do quadro. Uma terceira
 * escrita da mesma regra seria a terceira chance de divergir — mas as duas medidas do PLAN só
 * precisam de dois ramos dela, e escrevê-los aqui mantém esta consulta legível sem importar o
 * `CASE` inteiro. Se a regra mudar, muda nos três lugares: é o preço já pago pelas outras duas.
 */
const ehPendente = sql<boolean>`(
  ${trips.currentStatus} = 'received'
  AND (${trips.customerFields} ->> 'Status (portal)') IS DISTINCT FROM 'Assigned'
  AND (${trips.customerFields} ->> 'Aceitação (portal)') IS DISTINCT FROM 'Pending'
)`;

const ehAtribuida = sql<boolean>`(
  ${trips.currentStatus} = 'assigned'
  OR (${trips.currentStatus} = 'received'
      AND (${trips.customerFields} ->> 'Status (portal)') = 'Assigned')
)`;

/**
 * A JANELA DO PLAN é D1 e D2 — o que o card soma.
 *
 * Hoje fica de fora de propósito: o PLAN é planejamento, e o que já está correndo hoje pertence às
 * colunas da ORIGEM. Se a lista trouxesse hoje junto, ela mostraria mais linhas do que o número que
 * a abriu — e uma lista maior que o número é tão errado quanto uma menor.
 */
const janelaDoPlano = sql<boolean>`(
  ${trips.plannedPickupWindowStart} >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 day') AT TIME ZONE 'America/Sao_Paulo'
  AND ${trips.plannedPickupWindowStart} < (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '3 days') AT TIME ZONE 'America/Sao_Paulo'
)`;

/**
 * UM DIA SÓ da janela do plano — D1 é amanhã, D2 é depois de amanhã.
 *
 * Existe porque o PEND ATRIBUIÇÃO passou a mostrar os dois números separados (30/08, a pedido), e
 * cada um tem de abrir a SUA lista. A soma continua clicável no total, mas dois números que abrem a
 * mesma lista mostrariam mais linhas do que o número que a abriu — o erro que o comentário do
 * `janelaDoPlano` acima já descreve.
 *
 * O dia sai do fuso de SÃO PAULO, como no resto do painel: uma coleta às 22h de Brasília é 01h do
 * dia seguinte em UTC e cairia no número errado, justamente nas viagens noturnas.
 */
const diaDoPlano = (offset: 1 | 2): SQL<boolean> => sql<boolean>`(
  ${trips.plannedPickupWindowStart} >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '${sql.raw(String(offset))} day') AT TIME ZONE 'America/Sao_Paulo'
  AND ${trips.plannedPickupWindowStart} < (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '${sql.raw(String(offset + 1))} day') AT TIME ZONE 'America/Sao_Paulo'
)`;

function predicado(medida: MedidaDoPainel): SQL<boolean> {
  if (medida === "pend") return sql<boolean>`(${ehPendente} AND ${janelaDoPlano})`;
  if (medida === "pendD1") return sql<boolean>`(${ehPendente} AND ${diaDoPlano(1)})`;
  if (medida === "pendD2") return sql<boolean>`(${ehPendente} AND ${diaDoPlano(2)})`;
  if (medida === "atribuida") return sql<boolean>`(${ehAtribuida} AND ${janelaDoPlano})`;
  /*
   * A ATRASADA NÃO LEVA `janelaDoPlano`, e isso não é esquecimento.
   *
   * Ela mora na mesma faixa das outras duas na tela, mas conta OUTRA janela: hoje e todos os dias
   * anteriores, sem recorte. O prazo é que define — a viagem de ontem que ninguém atribuiu é a que
   * mais precisa aparecer. Somar a janela do plano aqui a esconderia justamente.
   *
   * É o mesmo predicado do filtro do quadro (`lateToAssign=true`), então o número, esta lista e
   * aquele filtro não têm como divergir.
   */
  if (medida === "atrasada") return lateToAssignSql();
  if (medida === "risco") return origemRiscoSql();
  return origemAtrasadaSql();
}

/**
 * As LH de uma medida numa frente.
 *
 * `region` nulo significa a frente "Sem região" — e o `IS NULL` é o que a distingue de "todas as
 * frentes". As duas coisas são diferentes e confundi-las traria o país inteiro para dentro de um
 * card que conta uma estação sem cadastro.
 */
export async function lhsDoPainel(
  region: string | null,
  medida: MedidaDoPainel,
  limite = 60,
): Promise<LhDoPainel[]> {
  const destino = sql`(select l2.name from ${locations} l2 where l2.id = ${trips.destinationLocationId})`;

  const linhas = await db
    .select({
      lh: trips.externalTripId,
      origem: locations.name,
      destino: sql<string | null>`${destino}`,
      quando: sql<string | null>`${trips.plannedPickupWindowStart}::text`,
    })
    .from(trips)
    .leftJoin(locations, eq(locations.id, trips.originLocationId))
    .where(
      and(
        predicado(medida),
        region === null ? isNull(locations.region) : eq(locations.region, region),
      ),
    )
    // A mais urgente primeiro — é a ordem em que alguém vai agir sobre elas.
    .orderBy(asc(trips.plannedPickupWindowStart))
    .limit(limite);

  return linhas.map((r) => ({
    lh: r.lh,
    origem: r.origem,
    destino: r.destino,
    quando: r.quando,
  }));
}
