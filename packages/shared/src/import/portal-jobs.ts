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
