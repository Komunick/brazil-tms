import { sql, type SQL } from "drizzle-orm";
import { PORTAL_ATRIBUIDA } from "@brazil-tms/shared";
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
 *   LH ATRASADA      ninguém foi escalado, e a coleta é em menos de 12h → decidir / escalar
 *   ORIGEM ATRASADA  foi escalado e não deu entrada na origem    → ligar para o motorista
 */

/**
 * QUANTO ANTES DA COLETA O ALARME ACENDE (2026-08-27, a pedido).
 *
 * Doze horas. Se falta menos que isso para o caminhão ter de estar na origem e ninguém foi
 * escalado, a viagem está atrasada.
 *
 * ── O QUE HAVIA AQUI, E POR QUE ESTAVA ERRADO ─────────────────────────────────────────────────
 *
 * O prazo era o MEIO-DIA DO DIA DA COLETA. A ideia era boa — um horário fixo, fácil de explicar —
 * e ela quebra em toda coleta de madrugada ou de manhã, que é metade da operação:
 *
 *   LT1Q8S02F0VL1   coleta 28/08 01:00   o alarme acendia 28/08 12:00   ONZE HORAS DEPOIS
 *   LT0Q8T02EP8I1   coleta 29/08 00:00   o alarme acendia 29/08 12:00   DOZE HORAS DEPOIS
 *
 * Medido em produção no dia da troca, com essas duas viagens reais na tela. Um alarme que toca
 * depois de o caminhão já ter de estar carregando não é um alarme atrasado: é um alarme inútil,
 * porque no instante em que ele acende não há mais nada a fazer.
 *
 * ── POR QUE ANTECEDÊNCIA, E NÃO OUTRO HORÁRIO FIXO ───────────────────────────────────────────
 *
 * Qualquer hora fixa do dia erra pelo mesmo motivo: a coleta não acontece sempre à mesma hora. A
 * antecedência acompanha cada viagem — doze horas antes da SUA coleta, seja ela à meia-noite ou
 * às seis da tarde. É a mesma forma da faixa de risco da origem, que também mede para trás a
 * partir da hora marcada.
 *
 * ── ISSO FAZ A COLUNA CRUZAR COM O PLAN, e é esperado ────────────────────────────────────────
 *
 * Uma coleta de amanhã à uma da manhã acende hoje às 13h — e nesse instante ela conta em PEND
 * ATRIBUIÇÃO (que é D1) e em LH ATRASADA ao mesmo tempo. As três colunas do PLAN já não eram
 * partes de um mesmo todo, e agora menos ainda. Está registrado em `DadosDaFrente.atrasadas`.
 */
const HORAS_DE_ANTECEDENCIA = 12;
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


/**
 * LH ATRASADA — falta menos de 12h para a coleta e não há ninguém escalado.
 *
 * AS DUAS PENDÊNCIAS CONTAM, e isso foi corrigido em 2026-08-23 (a pedido). A consulta antiga pegava
 * só `to_assign` — aceita e sem motorista — com o argumento de que `in_analysis` seria "proposta que
 * o cliente não decidiu", e cobrar atraso de quem espera resposta do outro lado seria injusto.
 *
 * A premissa estava errada. `Aceitação = Pending` é o estado em que o NOSSO botão de aceitar/recusar
 * funciona: quem não decidiu somos nós. Faltar aceitar e faltar escalar são duas pendências nossas,
 * com ações diferentes e a mesma consequência — a coleta está chegando e a LH não tem ninguém. No dia
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
    AND now() > ${trips.plannedPickupWindowStart} - make_interval(hours => ${HORAS_DE_ANTECEDENCIA})
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

/**
 * A JANELA DE AVISO: deveria ter chegado e ainda dá tempo (2026-08-27, a pedido).
 *
 * ── A REGRA DA OPERAÇÃO ───────────────────────────────────────────────────────────────────────
 *
 * O motorista tem de dar entrada na origem DUAS HORAS ANTES da hora da coleta. Passado esse ponto
 * sem ele aparecer, a viagem já está atrasada aos olhos de quem opera — mesmo que a hora da coleta
 * ainda não tenha chegado.
 *
 * É por isso que esta coluna e a de cima são DUAS, e não uma com dois tons:
 *
 *   ATRASADO < 2HS   passou de "duas horas antes" e a hora da coleta ainda não chegou → dá para ligar
 *   FORA DO PRAZO    a hora da coleta passou e ele não chegou                          → já perdeu
 *
 * A primeira é a única das duas em que alguém ainda consegue mudar o desfecho. Somá-las num número
 * só apagaria exatamente essa diferença — e o número somado não diria a quem ligar primeiro.
 *
 * ── AS DUAS NÃO SE SOBREPÕEM ──────────────────────────────────────────────────────────────────
 *
 * `now() <= plannedPickupWindowStart` fecha a janela no instante em que a outra abre. Sem esse
 * limite a viagem contaria nas duas colunas ao mesmo tempo, e a soma das duas passaria a ser maior
 * que o total de viagens atrasadas — um total que não fecha é o tipo de erro que ninguém consegue
 * explicar olhando a tela.
 *
 * O resto das condições é idêntico ao de cima de propósito: mesmo status, mesma exigência de haver
 * motorista escalado. O que separa as duas é SÓ o instante.
 */
export function origemRiscoSql(): SQL<boolean> {
  return sql<boolean>`(
    ${trips.currentStatus} IN ('received', 'assigned')
    AND nullif(trim(${trips.customerFields} ->> 'Motorista (portal)'), '') IS NOT NULL
    AND now() > ${trips.plannedPickupWindowStart} - interval '2 hours'
    AND now() <= ${trips.plannedPickupWindowStart}
  )`;
}
