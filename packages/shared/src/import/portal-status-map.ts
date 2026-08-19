import type { TripStatus } from "../domain/trip-status";

/**
 * O QUE CADA RÓTULO DO PORTAL DEVERIA SIGNIFICAR NO TMS (2026-08-19).
 *
 * Esta tabela NÃO decide status de viagem nenhuma — quem decide é `portal-milestones.ts`, a partir
 * dos horários reais que o cliente registra, e é assim que tem de ser: um marco carrega QUANDO
 * aconteceu, e é desse horário que sai a pontualidade. O rótulo carrega só o quê.
 *
 * Ela existe para CONFERIR. Se o portal diz `Departed` e a viagem não está em trânsito, alguma coisa
 * não chegou — um horário que veio zerado, um ciclo que falhou, um marco que o TMS não reconhece. A
 * verificação de 2026-08-19 sobre 3.938 viagens não achou nenhuma divergência; o valor disto é
 * justamente avisar no dia em que achar, em vez de depender de alguém desconfiar e perguntar.
 *
 * Um rótulo desconhecido NUNCA é divergência: o portal pode ganhar um status novo amanhã, e acusar
 * o que a gente ainda não aprendeu transformaria a tela num alarme que se ignora.
 */
export const TMS_STATUSES_FOR_PORTAL: Record<string, readonly TripStatus[]> = {
  /** O cliente ainda está designando: não há motorista lá, e não há o que espelhar. */
  Assigning: ["received"],
  /**
   * Duas respostas certas. `assigned` é a viagem já espelhada; `received` é a que o portal atribuiu e
   * o TMS ainda não conseguiu — falta de cadastro, conflito de agenda. Essa segunda não é divergência
   * de STATUS, é atribuição pendente, e tem contagem própria (`atribuicoesPendentes`) porque a ação
   * que ela pede é outra.
   */
  Assigned: ["received", "assigned", "confirmed"],
  Loading: ["loading"],
  /** O TMS não tem estado de lacre: lacrar é o fim do carregamento. */
  Seal: ["loaded"],
  Departed: ["in_transit"],
  /** "Chegou na parada seguinte" — qual parada depende da perna, então as duas valem. */
  Arrived: ["at_origin", "at_destination"],
  Unseal: ["unloading"],
  /** O portal chama de "Operating" o que já começou no `Unseal`: quebrar o lacre inicia a descarga. */
  Operating: ["unloading"],
  Unloaded: ["unloaded"],
  /** Concluída no cliente; aqui ela segue para o faturamento sem deixar de estar concluída. */
  Completed: ["completed", "billing_pending", "billing_ready", "billed"],
  Cancelled: ["cancelled"],
};

/**
 * O par (rótulo do portal, status do TMS) é coerente?
 *
 * Rótulo que não conhecemos responde `true` — ver o comentário da tabela. Viagem sem rótulo nenhum
 * também: é a que nunca veio do portal, e sobre ela este arquivo não tem o que dizer.
 */
export function portalStatusAgrees(
  portalLabel: string | null | undefined,
  tmsStatus: TripStatus,
): boolean {
  if (!portalLabel) return true;
  const esperados = TMS_STATUSES_FOR_PORTAL[portalLabel];
  if (!esperados) return true;
  return esperados.includes(tmsStatus);
}
