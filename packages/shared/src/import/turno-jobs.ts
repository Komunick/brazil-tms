/**
 * OS JOBS DA PASSAGEM DE TURNO (2026-08-26).
 *
 * ── POR QUE UM GRUPO PRÓPRIO, E NÃO DENTRO DE `PRE_SM_JOBS` ───────────────────────────────────
 *
 * Aquele grupo já abriga dois assuntos — a Pré-SM e a carga de posições — e o que os mantém juntos
 * é UMA coisa concreta: os dois usam a credencial da Integra, que vive só no worker. O comentário
 * lá diz isso, e diz também que um terceiro assunto usando aquela credencial valeria grupo próprio.
 *
 * A trava de turno não usa credencial nenhuma. Enfiá-la ali por ser "mais um job" apagaria a única
 * informação que aquele agrupamento carrega.
 */
export const TURNO_JOBS = {
  /**
   * A TRAVA DE SEGURANÇA — fecha o bloco que ninguém entregou.
   *
   * O fechamento normal é botão, e é ele que registra quem passou o turno. Esta trava existe para
   * o caso em que ninguém apertou: sem ela, um bloco esquecido em aberto aceitaria edição
   * retroativa dias depois, e a linha do tempo passaria a mentir sem que nada acusasse.
   *
   * Ela deixa `fechado_por_user_id` NULO e marca `fechado_automaticamente` — porque não houve
   * entrega, e a tela precisa poder dizer isso em vez de inventar um responsável.
   */
  turnoFecharAtrasados: "turno.fechar_atrasados",
} as const;

export type TurnoJobName = (typeof TURNO_JOBS)[keyof typeof TURNO_JOBS];

export interface TurnoJobPayloads {
  /** Sem payload: o job decide sozinho o que está atrasado, contando em hora de São Paulo. */
  "turno.fechar_atrasados": Record<string, never>;
}
