/**
 * A varredura das viagens que o cliente RETIROU do portal (2026-08-18).
 *
 * Irmã de `sla/jobs.ts`: cron agendado, sem entrada por execução. O BFF nunca enfileira — é o worker
 * que roda de tempos em tempos e pergunta quem parou de aparecer nas listagens do portal.
 */

export const PORTAL_JOBS = {
  portalWithdrawn: "portal.withdrawn",
} as const;

export type PortalJobName = (typeof PORTAL_JOBS)[keyof typeof PORTAL_JOBS];

/** Cron agendado: sem entrada por execução. */
export type PortalWithdrawnPayload = Record<string, never>;

export interface PortalJobPayloads {
  "portal.withdrawn": PortalWithdrawnPayload;
}

/**
 * A criação da Pré-SM na gerenciadora Logae (2026-08-25, fatia 026).
 *
 * Ao contrário da varredura acima, este é ENFILEIRADO por evento: quando a ordem de atribuição volta
 * confirmada do portal do cliente. É o único momento em que a atribuição existe dos dois lados e
 * todos os campos estão disponíveis — antes disso, criar a Pré-SM de uma atribuição que o portal
 * ainda pode recusar geraria escolta contratada para viagem que ninguém vai fazer.
 */
export const PRE_SM_JOBS = {
  preSmCriar: "pre_sm.criar",
  preSmCancelar: "pre_sm.cancelar",
} as const;

export type PreSmJobName = (typeof PRE_SM_JOBS)[keyof typeof PRE_SM_JOBS];

export interface PreSmCriarPayload {
  tripId: string;
  /** A ordem do portal que originou isto — é o que liga a Pré-SM à decisão que a pediu. */
  portalCommandId: string;
}

export interface PreSmJobPayloads {
  "pre_sm.criar": PreSmCriarPayload;
  "pre_sm.cancelar": PreSmCancelarPayload;
}

/**
 * O CANCELAMENTO da Pré-SM (2026-08-25, fatia 026).
 *
 * Job separado, e não uma chamada direta do BFF, pela mesma regra que vale para a criação: a
 * credencial da gerenciadora vive **só no worker**. Uma rota do app web que chamasse a Integra
 * exigiria a senha de produção dentro do Next, e a constituição não permite.
 *
 * O efeito prático para quem clica: o botão pede, e o estado vira `cancelada` quando o worker
 * confirma — não no instante do clique. É honesto, porque quem cancela de verdade é ela.
 */
export interface PreSmCancelarPayload {
  tripPreSmId: string;
  /** Quem pediu — vai para a auditoria do lado de cá. */
  actorUserId: string;
}
