import { sql, type SQL } from "drizzle-orm";
import { APP_TIME_ZONE, PORTAL_ATRIBUIDA } from "@brazil-tms/shared";
import { lanes, trips } from "../../schema";

/**
 * AS DUAS FAIXAS VERMELHAS DO CARTÃO DA FRENTE, escritas UMA vez (2026-08-23).
 *
 * Elas moram aqui, e não dentro da consulta do painel, porque cada uma é contada num lugar e
 * LISTADA em outro: o número no cartão e o total do quadro têm de ser o mesmo número. Escrito duas
 * vezes, os dois divergem sem que nenhum dos dois pareça errado sozinho — foi essa a razão de
 * `awaitingAssignmentSql` existir, e é a mesma aqui.
 *
 * As duas faixas dizem coisas diferentes e pedem ações diferentes:
 *
 *   LH ATRASADA      ninguém foi escalado, e o prazo já venceu   → decidir / escalar
 *   ORIGEM ATRASADA  foi escalado e não deu entrada na origem    → ligar para o motorista
 */

/**
 * O prazo de atribuição: MEIO-DIA do próprio dia da coleta.
 *
 * Escrito como "o meio-dia do dia da coleta", ele cobre os dois casos de uma vez — a viagem de
 * hoje depois das 12h E a de qualquer dia anterior, cujo meio-dia passou faz tempo. É por isso
 * que a conta vive no SERVIDOR: no navegador ela só sabia olhar "hoje", e a viagem de ontem que
 * ninguém atribuiu sumia do painel — o pior desfecho possível para o caso mais grave.
 *
 * O meio-dia é o de São Paulo, e a volta para `timestamptz` é o que garante isso: quem abre a
 * tela de outro fuso vê o mesmo prazo, porque quem decide é o relógio da operação. O fuso entra
 * como literal (`sql.raw`) porque como parâmetro o Postgres veria expressões diferentes entre o
 * SELECT e o GROUP BY.
 */
/**
 * A VIAGEM É DE ROTA NOSSA?
 *
 * Escrito uma vez porque a mesma pergunta aparece no alarme e no filtro do quadro, e as duas
 * respostas têm de ser a mesma — número que abre uma lista diferente do que conta é o erro em que
 * nenhum dos dois lados parece errado sozinho.
 *
 * `lane_id` é preenchido na importação desde 2026-08-16 (`resolveLaneId` cria a rota na primeira
 * viagem do par); medido em produção, nenhuma viagem está sem ele. Ainda assim o `EXISTS` responde
 * `false` para nulo, e o lado seguro é esse: sem rota conhecida e sem aceite, não acende alarme.
 */
export const rotaNossaSql = sql<boolean>`(
  (${trips.customerFields} ->> 'Aceitação (portal)') = 'Accepted'
  OR EXISTS (
    SELECT 1 FROM ${lanes} l
    WHERE l.id = ${trips.laneId} AND l.in_network AND l.archived_at IS NULL
  )
)`;

const MEIO_DIA_DA_COLETA = sql`(
  ((${trips}.planned_pickup_window_start AT TIME ZONE ${sql.raw(`'${APP_TIME_ZONE}'`)})::date
    + interval '12 hours') AT TIME ZONE ${sql.raw(`'${APP_TIME_ZONE}'`)}
)`;

/**
 * LH ATRASADA — passou do meio-dia do dia da coleta e não há ninguém escalado.
 *
 * AS DUAS PENDÊNCIAS CONTAM, e isso foi corrigido em 2026-08-23 (a pedido). A consulta antiga pegava
 * só `to_assign` — aceita e sem motorista — com o argumento de que `in_analysis` seria "proposta que
 * o cliente não decidiu", e cobrar atraso de quem espera resposta do outro lado seria injusto.
 *
 * A premissa estava errada. `Aceitação = Pending` é o estado em que o NOSSO botão de aceitar/recusar
 * funciona: quem não decidiu somos nós. Faltar aceitar e faltar escalar são duas pendências nossas,
 * com ações diferentes e a mesma consequência — a hora passou e a LH não tem ninguém. No dia em que
 * isto foi medido, a faixa mostrava 0 em todas as frentes enquanto 24 viagens estavam exatamente
 * nesse estado.
 *
 * O recorte espelha o `CASE` do `displayStatusSql` em vez de perguntar pelo motorista: `received` e
 * status do portal diferente de `Assigned` é, por construção, `in_analysis` ∪ `to_assign`. Perguntar
 * "motorista nulo" daria o mesmo número hoje e passaria a divergir no dia em que o portal preencher
 * um dos dois campos sem o outro.
 *
 * SEM RECORTE DE DATA, de propósito: o prazo é que define. A LH de ontem que ninguém atribuiu é
 * justamente a que mais precisa aparecer.
 *
 * ── E SÓ PARA ROTA NOSSA (2026-08-23, a pedido) ───────────────────────────────────────────────
 *
 * O portal mostra à transportadora as viagens que já são dela E as ofertas que ainda não têm dono.
 * Sem esta condição, a faixa cobrava atribuição de rota que a empresa não roda: 41 viagens de
 * vermelho no dia em que isto foi medido, das quais 40 eram oferta alheia. Uma tela que pisca por
 * coisa que ninguém vai fazer ensina a operação a não olhar a tela.
 *
 * NOSSA É UMA DAS DUAS COISAS, e as duas precisam estar aqui:
 *
 *   A ROTA ESTÁ NA MALHA (`lanes.in_network`) — o cadastro que a operação controla, semeado com o
 *   que a empresa provou rodar. É a resposta para a viagem que ainda não foi aceita.
 *
 *   OU A VIAGEM JÁ FOI ACEITA. Aceitar é o ato que torna a rota nossa, e ele vale MESMO que o
 *   cadastro não conheça a rota — foi assim que 8 viagens de Jaboatão → Simões Filho apareceram,
 *   rota nova de verdade. Sem esta metade, uma rota nova aceita ficaria sem alarme justamente
 *   enquanto ninguém a escalasse, que é quando o alarme serve.
 */
export function lateToAssignSql(): SQL<boolean> {
  return sql<boolean>`(
    ${trips.currentStatus} = 'received'
    AND (${trips.customerFields} ->> 'Status (portal)') IS DISTINCT FROM ${PORTAL_ATRIBUIDA}
    AND now() > ${MEIO_DIA_DA_COLETA}
    AND ${rotaNossaSql}
  )`;
}

/**
 * Por quanto tempo uma origem atrasada continua contando depois da hora de chegar.
 *
 * Um dia. Depois disso não é atraso, é viagem morta que ninguém encerrou: problema real, mas outro,
 * e que entupiria este.
 */
const DIAS_QUE_O_ALARME_DURA = 1;

/**
 * ORIGEM ATRASADA — tem motorista escalado, passou da hora de chegar e ele não deu entrada.
 *
 * ── O PRAZO JÁ VEM PRONTO DO PORTAL, e eu subtraía duas horas dele ────────────────────────────
 *
 * Esta consulta nasceu com `now() > coleta - 2 horas`, escrita a partir da regra da operação ("o
 * motorista tem que chegar duas horas antes"). Está errada, e a tela do portal provou (2026-08-23):
 *
 *   Nome da viagem   20260820F0_..._00:00_02:00_HUB_01
 *   Chegada          19-08 19:37   (STA: 20-08 00:00)
 *
 * `planned_pickup_window_start` é preenchido com `leg.origin.plannedArrival` — o STA, a hora em que
 * o motorista TEM de estar na origem. A antecedência já está dentro do número: a janela dessa
 * viagem é 00:00 → 02:00, chegar às 00:00 e sair às 02:00. Subtrair mais duas horas fazia o alarme
 * acender às 22:00, duas horas antes de existir atraso.
 *
 * ── "NÃO CHEGOU" SAI DO STATUS, sem cruzar a tabela de eventos ────────────────────────────────
 *
 * `received`/`assigned` quer dizer "ainda não chegou" — verificado, não suposto: nenhuma viagem com
 * marco de chegada continua num desses dois status, e não existe viagem em `at_origin` sem marco.
 * Sem GPS e sem coordenada de estação, que foi onde eu perdi tempo antes de medir.
 *
 * ── E COM MOTORISTA, que era o que faltava ────────────────────────────────────────────────────
 *
 * Sem esta condição a faixa contava proposta que ninguém tinha nem aceitado — 16 viagens no dia em
 * que foi medida, todas sem motorista. Isso é LH ATRASADA, a faixa de cima. Aqui só entra quem tem
 * alguém escalado: a ação é ligar para o motorista, e sem motorista não há para quem ligar.
 */
export function origemAtrasadaSql(): SQL<boolean> {
  return sql<boolean>`(
    ${trips.currentStatus} IN ('received', 'assigned')
    AND nullif(trim(${trips.customerFields} ->> 'Motorista (portal)'), '') IS NOT NULL
    AND now() > ${trips.plannedPickupWindowStart}
    AND ${trips.plannedPickupWindowStart} > now() - make_interval(days => ${DIAS_QUE_O_ALARME_DURA})
  )`;
}
