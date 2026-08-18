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
export const TRIP_DISPLAY_EXTRA = ["in_analysis", "to_assign"] as const;

export type TripDisplayStatus = TripStatus | (typeof TRIP_DISPLAY_EXTRA)[number];

/** A palavra do portal para "ninguém decidiu ainda". */
export const ACEITACAO_PENDENTE = "Pending";

/**
 * O rótulo a mostrar para esta viagem. Só `received` se desdobra; todo o resto passa direto.
 *
 * Sem informação de aceitação — viagem digitada à mão, ou vinda de antes de o TMS ler esse eixo —
 * cai em `to_assign`. É a afirmação que se sustenta sem o portal: o TMS não tem ninguém escalado.
 * "Em análise" seria uma afirmação sobre o cliente, e essa não dá para fazer sem ele ter falado.
 */
export function displayStatusOf(
  status: TripStatus,
  portalAcceptance: string | null | undefined,
): TripDisplayStatus {
  if (status !== "received") return status;
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
  s === "received" ? (["in_analysis", "to_assign"] as TripDisplayStatus[]) : [s],
);

/**
 * O trecho de URL que abre o quadro exatamente neste rótulo.
 *
 * Existe para que a contagem e a lista nunca discordem: quem clica num número tem de cair na lista
 * que o produziu. As duas filas compartilham o mesmo status real (`received`) e se separam pelo
 * parâmetro `inAnalysis` — que é exaustivo por construção, `true` e `false` cobrindo tudo sem
 * sobreposição.
 */
export function boardQueryForDisplayStatus(status: TripDisplayStatus): string {
  if (status === "in_analysis") return "status=received&inAnalysis=true";
  if (status === "to_assign") return "status=received&inAnalysis=false";
  return `status=${status}`;
}
