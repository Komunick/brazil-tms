import { TRIP_STATUSES, type TripStatus } from "./trip-status";

/**
 * O que a OPERAÇÃO chama uma viagem que ainda não saiu (2026-08-18, a pedido).
 *
 * "Recebida" descrevia o TMS, não o trabalho. Dentro dela viviam duas filas que pedem coisas
 * completamente diferentes de pessoas diferentes, e ficavam indistinguíveis no quadro:
 *
 *   EM ANÁLISE — a proposta chegou e ninguém decidiu. O que falta é alguém ACEITAR ou REJEITAR.
 *   P/ATRIBUIR — o cliente já aceitou. O que falta é alguém pôr um MOTORISTA.
 *
 * Medido no dia em que isto foi pedido: 326 esperando atribuição contra 63 esperando decisão. Um
 * quadro que mostra 389 "Recebidas" esconde justamente a diferença que decide quem age.
 *
 * ── POR QUE É RÓTULO E NÃO STATUS NOVO ─────────────────────────────────────────────────────────
 *
 * A máquina de status do TMS continua com os mesmos 16 valores. Isto aqui não é um estado do
 * caminhão — é a leitura do que o CLIENTE respondeu, e ela já vive em `customer_fields`. Criar dois
 * status de verdade exigiria transições, enum no banco e histórico novo para descrever uma coisa
 * que o TMS não controla e que pode mudar quando a Shopee quiser.
 *
 * ── O EIXO É A ACEITAÇÃO, E ISSO FOI MEDIDO ────────────────────────────────────────────────────
 *
 * O pedido dizia "aceitação Accepted E status de viagem Assigned". Os dois exemplos dados junto
 * provaram outra coisa: `LT0Q8J02DVJ91` — o exemplo de "P/Atribuir" — está em `Assigning`, não em
 * `Assigned`. Pelo par descrito, ela não entraria. A regra por par pegaria 8 viagens; pelo eixo da
 * aceitação, pega as 326 que a operação de fato enxerga como fila de despacho.
 *
 * `Assigned` no portal quer dizer que JÁ TEM motorista lá — é o oposto de "para atribuir".
 */
export const TRIP_QUEUES = ["in_analysis", "to_assign", "awaiting_arrival"] as const;

export type TripQueue = (typeof TRIP_QUEUES)[number];

export type TripDisplayStatus = TripStatus | TripQueue;

/** A palavra do portal para "ninguém decidiu ainda". */
export const ACEITACAO_PENDENTE = "Pending";

/** A palavra do portal para "já tem motorista nesta viagem". */
export const PORTAL_ATRIBUIDA = "Assigned";

/**
 * O rótulo a mostrar para esta viagem. Só `received` se desdobra; todo o resto passa direto.
 *
 * A ORDEM DOS TESTES É A DO CICLO DE VIDA, e não é arbitrária: "já tem motorista" é o estado mais
 * avançado dos três e por isso vem primeiro. Uma viagem `Assigned` também está `Accepted`, então
 * testar a aceitação antes a jogaria em "p/atribuir" — mandando a operação fazer um trabalho que o
 * cliente já fez.
 *
 * Sem informação nenhuma — viagem digitada à mão, ou vinda de antes de o TMS ler esses eixos — cai
 * em `to_assign`. É a afirmação que se sustenta sem o portal: não há ninguém escalado aqui. As
 * outras duas seriam afirmações sobre o CLIENTE, e essas não dá para fazer sem ele ter falado.
 */
export function displayStatusOf(
  status: TripStatus,
  portalAcceptance: string | null | undefined,
  portalStatus?: string | null,
): TripDisplayStatus {
  /**
   * `at_origin` E a fila `awaiting_arrival` mostram a MESMA linha: "NA ORIGEM" (2026-08-19, a pedido).
   *
   * São dois estados de verdade diferentes — um é "o cliente escalou motorista e espera-se que ele
   * apareça", o outro é "o caminhão chegou, com hora registrada" — e o quadro deixou de distingui-los
   * porque a operação não distingue: para quem olha a tela, os dois querem dizer que aquela viagem
   * está na origem.
   *
   * O que NÃO muda: o status real da viagem, a máquina de estados, a linha do tempo da viagem e o
   * botão de marco continuam com `at_origin` separado e escrito "Na origem". A fusão é só de
   * EXIBIÇÃO no quadro — misturar as duas coisas apagaria a diferença entre planejado e acontecido,
   * que é o que alimenta o cálculo de pontualidade.
   */
  if (status === "at_origin") return "awaiting_arrival";
  if (status !== "received") return status;
  if (portalStatus === PORTAL_ATRIBUIDA) return "awaiting_arrival";
  return portalAcceptance === ACEITACAO_PENDENTE ? "in_analysis" : "to_assign";
}

/**
 * A ordem do CICLO DE VIDA com as duas filas no lugar de "Recebida".
 *
 * "Em análise" vem antes de "P/Atribuir" porque é essa a sequência do trabalho: primeiro alguém
 * aceita, depois alguém escala. Quem lê o quadro espera encontrar as etapas na ordem em que
 * acontecem, e uma lista que reordena obriga a procurar de novo o que já se sabia onde era.
 */
export const TRIP_DISPLAY_ORDER: readonly TripDisplayStatus[] = TRIP_STATUSES.flatMap((s) =>
  s === "received"
    ? ([...TRIP_QUEUES] as TripDisplayStatus[])
    : // `at_origin` sai da lista porque nada é exibido com esse rótulo: `displayStatusOf` o funde em
      // `awaiting_arrival` ("NA ORIGEM"). Deixá-lo aqui criaria uma opção de filtro que não conta
      // nada e um cartão eternamente zerado.
      s === "at_origin"
      ? []
      : [s],
);

export function isTripQueue(status: TripDisplayStatus): status is TripQueue {
  return (TRIP_QUEUES as readonly string[]).includes(status);
}

/**
 * O trecho de URL que abre o quadro exatamente neste rótulo.
 *
 * Existe para que a contagem e a lista nunca discordem: quem clica num número tem de cair na lista
 * que o produziu. As três filas compartilham o mesmo status real (`received`) e se separam por UM
 * parâmetro com três valores — não por dois booleanos, que permitiriam pedir combinações que não
 * existem ("em análise E já atribuída") e deixariam o quadro vazio sem explicar por quê.
 */
export function boardQueryForDisplayStatus(status: TripDisplayStatus): string {
  return isTripQueue(status) ? `status=received&queue=${status}` : `status=${status}`;
}
