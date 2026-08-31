/**
 * O JOB DO PERFIL — o descarte da foto de quem foi desativado (fatia 029, FR-024 e FR-024a).
 *
 * A foto de rosto de um funcionário desativado tem prazo: **90 dias**, decidido em 31/08. O prazo é
 * decisão declarada, e não padrão silencioso — a spec exigia que fosse dito em voz alta.
 *
 * ── O DESCARTE PRECISA ACONTECER SOZINHO (FR-024a) ────────────────────────────────────────────
 *
 * Um prazo que depende de alguém lembrar não é prazo, é intenção. Por isso ele é job agendado, e não
 * um botão numa tela de administração.
 */
export const PERFIL_JOBS = {
  /**
   * VARREDURA DIÁRIA, e não agendamento no ato da desativação.
   *
   * Agendar um job com 90 dias de atraso seria mais direto e exigiria CANCELAR na reativação — e um
   * cancelamento esquecido apaga a foto de alguém que voltou a trabalhar. A varredura filtra por
   * `desativado_em`, que é zerado ao reativar: quem volta some do alvo sozinho, sem estado para
   * esquecer.
   */
  perfilLimparFotos: "perfil.limpar_fotos",
} as const;

export type PerfilJobName = (typeof PERFIL_JOBS)[keyof typeof PERFIL_JOBS];

export interface PerfilJobPayloads {
  /** Sem payload: o job decide sozinho quem passou dos 90 dias. */
  "perfil.limpar_fotos": Record<string, never>;
}
