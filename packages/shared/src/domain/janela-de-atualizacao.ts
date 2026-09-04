import { DateTime } from "luxon";
import { APP_TIME_ZONE } from "../formatting";

/**
 * A JANELA DIÁRIA DE ATUALIZAÇÃO — o aviso que aparece antes do sistema reiniciar (03/09, a pedido).
 *
 * ── O QUE ELA É, E O QUE ELA NÃO É ────────────────────────────────────────────────────────────
 *
 * Ela **avisa**. Não deploia, não agenda, não promove nada. Quem atualiza a produção continua sendo
 * uma pessoa, e isso não é limitação temporária: produção mudando sozinha, todo dia, sem ninguém
 * olhando, é exatamente o que a constituição deste repositório proíbe.
 *
 * ── É CONTA DE RELÓGIO, e por isso não tem job nem tabela ─────────────────────────────────────
 *
 * O navegador já sabe que horas são. Um job para "avisar às 12:00" precisaria de fila, de worker
 * vivo e de um caminho até a tela — e falharia justamente no dia em que o worker estivesse fora do
 * ar, que é um dia em que provavelmente HÁ deploy. Isto aqui não tem como falhar por dependência:
 * ou o relógio funciona, ou nada funciona.
 *
 * ── A FRASE É SOBRE A JANELA, NÃO SOBRE UM DEPLOY ─────────────────────────────────────────────
 *
 * O aviso aparece TODO DIA (decisão do usuário, 03/09), inclusive nos dias em que nada é
 * atualizado. Isso traz um risco conhecido: aviso que grita todo dia deixa de ser lido.
 *
 * O que reduz esse risco é a redação, e ela é responsabilidade da tela: dizer "janela de
 * atualização às 12:10" é verdade todo dia; dizer "o sistema VAI reiniciar" é mentira na maioria
 * deles, e é a mentira que faz a operação parar de acreditar no aviso.
 */

/** A hora da janela, no fuso de São Paulo. Sempre a mesma. */
export const HORA_DA_ATUALIZACAO = { hora: 12, minuto: 10 } as const;

/** Quantos minutos antes o aviso começa a aparecer. */
export const MINUTOS_DE_AVISO = 10;

export interface AvisoDaAtualizacao {
  /** Minutos inteiros que faltam, arredondados para cima. Entre 1 e `MINUTOS_DE_AVISO`. */
  minutosRestantes: number;
  /** `12:10`, já formatado no fuso de São Paulo — a tela não deve remontar isso. */
  horario: string;
}

/**
 * Estamos na janela de aviso agora?
 *
 * Devolve `null` fora dela — que é o estado em 23 horas e 50 minutos do dia, e por isso é o caminho
 * que precisa ser barato e óbvio.
 *
 * ── A CONTA É EM SÃO PAULO, e ignorar isso quebraria de um jeito difícil de ver ────────────────
 *
 * O servidor roda em UTC, e meio-dia em São Paulo é 15h em UTC. Uma conta ingênua sobre a hora do
 * relógio local do computador acertaria na máquina de quem escreveu e erraria em três horas no
 * servidor — e o sintoma seria o aviso aparecendo às 9h da manhã para a operação.
 */
export function avisoDaAtualizacao(agora: Date): AvisoDaAtualizacao | null {
  const emSaoPaulo = DateTime.fromJSDate(agora).setZone(APP_TIME_ZONE);
  const janela = emSaoPaulo.set({
    hour: HORA_DA_ATUALIZACAO.hora,
    minute: HORA_DA_ATUALIZACAO.minuto,
    second: 0,
    millisecond: 0,
  });

  const faltamMs = janela.toMillis() - emSaoPaulo.toMillis();

  /*
    FORA DA JANELA nos dois sentidos.

    Depois da hora (`faltamMs <= 0`) o aviso some sozinho — não existe estado "atualizando", porque
    o próprio reinício tira a página do ar e um aviso que sobrevivesse a ele estaria mentindo.

    E o limite de cima é `>`, não `>=`: às 11:59:59 faltam 10 minutos e 1 segundo, e o aviso ainda
    não é para aparecer.
  */
  if (faltamMs <= 0) return null;
  const faltamMinutos = faltamMs / 60_000;
  if (faltamMinutos > MINUTOS_DE_AVISO) return null;

  return {
    // Arredondado para CIMA: aos 30 segundos do fim ainda se lê "1 minuto", nunca "0 minutos" —
    // que soaria como "já passou" justamente no momento em que mais importa agir.
    minutosRestantes: Math.ceil(faltamMinutos),
    horario: janela.toFormat("HH:mm"),
  };
}
