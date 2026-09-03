/**
 * "É O TMS QUE CAIU OU A MINHA INTERNET?" (2026-09-03).
 *
 * A pergunta é da operação e até agora não tinha resposta na tela: quando algo não carrega, o que
 * aparece é o mesmo erro genérico nos dois casos, e a diferença importa muito — uma é problema
 * nosso, a outra é problema do escritório, e a ação de quem está na mesa é oposta.
 *
 * ── POR QUE UMA SONDA SÓ NÃO RESOLVE ─────────────────────────────────────────────────────────
 *
 * Perguntar ao próprio TMS não distingue nada: se ele caiu, a resposta some junto e tudo que se
 * sabe é "não veio". Para separar as duas falhas é preciso um TERCEIRO ponto, fora da nossa VM e
 * fora da rede de quem pergunta. Daí os dois alvos:
 *
 *   TMS respondeu           -> está no ar; se estiver lento, é lentidão, não queda.
 *   TMS não, terceiro sim   -> a internet de quem pergunta funciona. Quem caiu fomos nós.
 *   TMS não, terceiro não   -> a rede local (ou o caminho até a internet). Não somos nós.
 *
 * O alvo do TMS é `/saude`, que o Caddy responde SEM tocar no Next — de propósito, para que a
 * sonda continue valendo justamente quando o aplicativo é quem está fora.
 *
 * ── ESTE ARQUIVO NÃO FALA COM A REDE ─────────────────────────────────────────────────────────
 *
 * Só classifica sinais já medidos. É o que torna a régua testável sem servidor, sem relógio e sem
 * `fetch` de mentira — os casos que interessam são combinações, e combinação se testa em memória.
 */

export type EstadoDaConexao =
  /** Tudo respondendo dentro do esperado. A tela não mostra nada. */
  | "ok"
  /** O TMS responde, mas devagar. É aviso, não queda. */
  | "lenta"
  /** O TMS não responde E a internet de quem pergunta está boa. O problema é nosso. */
  | "servidor_fora"
  /** Nem o TMS nem o terceiro respondem. O problema está na rede de quem pergunta. */
  | "sem_internet"
  /** Ainda não dá para afirmar — falta medir. NUNCA se chuta entre os dois acima. */
  | "indefinido";

export interface SinaisDaSonda {
  /**
   * `navigator.onLine`. Vale pelo lado FALSO: `false` prova que não há link nenhum. `true` não
   * prova internet — o cabo pode estar na parede e o provedor fora, que é exatamente o caso de
   * quem tem perda de pacote no meio do caminho.
   */
  temLink: boolean;
  /** A sonda `/saude` respondeu? `null` = ainda não foi medida. */
  tmsRespondeu: boolean | null;
  /** Quanto a sonda do TMS levou, em ms. `null` quando não respondeu ou não foi medida. */
  tmsMs: number | null;
  /** Um host de FORA respondeu? `null` = não foi medido (não precisou, ou ainda não deu tempo). */
  internetRespondeu: boolean | null;
}

/**
 * Acima disto o TMS está no ar, mas a tela vai parecer travada.
 *
 * Dois segundos e não meio: a VM fica em us-sanjose-1 e a operação em Salvador, então a ida e volta
 * já custa centenas de milissegundos num dia bom. Um limiar apertado acusaria a distância — que não
 * é defeito e não tem conserto do lado de cá — e viraria ruído permanente.
 */
export const LIMIAR_LENTO_MS = 2_000;

/**
 * A REGRA. Lida de cima para baixo, e a ordem é o argumento:
 *
 * 1. Sem link não há o que interpretar, e nenhuma sonda vai responder mesmo.
 * 2. Se o TMS respondeu, acabou: ele está no ar, e a única dúvida que resta é a velocidade.
 * 3. Só quando o TMS falha é que o terceiro decide de quem é a culpa.
 * 4. Sem o terceiro medido a resposta é "indefinido" — e isso é deliberado. Chutar aqui é o pior
 *    resultado possível: dizer "sua internet caiu" para quem está com a internet boa manda a
 *    pessoa mexer no roteador enquanto o servidor é que está fora.
 */
export function classificarConexao(s: SinaisDaSonda): EstadoDaConexao {
  if (!s.temLink) return "sem_internet";

  if (s.tmsRespondeu === true) {
    return s.tmsMs !== null && s.tmsMs > LIMIAR_LENTO_MS ? "lenta" : "ok";
  }

  if (s.tmsRespondeu === null) return "indefinido";

  if (s.internetRespondeu === true) return "servidor_fora";
  if (s.internetRespondeu === false) return "sem_internet";
  return "indefinido";
}

/** Estados em que a tela deve dizer alguma coisa. Silêncio quando está tudo bem. */
export function precisaAvisar(estado: EstadoDaConexao): boolean {
  return estado !== "ok" && estado !== "indefinido";
}
