import {
  chaveDaEstacao,
  montarCorpoDoSetPreSM,
  motivosDeNaoEnviar,
  type DadosParaSetPreSM,
  type MotivoDeNaoEnviar,
} from "@brazil-tms/shared";

/**
 * A DECISÃO DO JOB, sem banco e sem rede (2026-08-25, fatia 026).
 *
 * O que o job faz de verdade — buscar a viagem, chamar a gerenciadora, gravar — precisa de banco e
 * de rede, e por isso não pode ser provado por teste. O que PODE ser provado é isto: dado o estado
 * do mundo, criar ou não, e o que mandar.
 *
 * A separação existe porque a validação de verdade não existe: a gerenciadora não tem homologação
 * para nós. Cada pedaço que sai do caminho testável é um pedaço que só a primeira criação real
 * verifica — e ela custa dinheiro.
 */

export type Desfecho =
  | { tipo: "nao_criar"; motivos: MotivoDeNaoEnviar[] }
  | { tipo: "desligado"; corpo: Record<string, unknown> }
  | { tipo: "teto_atingido"; corpo: Record<string, unknown> }
  | { tipo: "criar"; corpo: Record<string, unknown> };

export interface Contexto {
  /** `INTEGRA_PRE_SM_ATIVO === "true"`. Ausente ou qualquer outra coisa = desligado. */
  ativo: boolean;
  /** `INTEGRA_PRE_SM_TETO_DIARIO`, com zero como padrão. */
  tetoDiario: number;
  criadasHoje: number;
  /** Sem credencial a integração está desligada — é um estado legítimo, não uma falha. */
  temCredencial: boolean;
}

/**
 * O QUE FAZER com esta viagem.
 *
 * ── A ORDEM DAS PERGUNTAS ─────────────────────────────────────────────────────────────────────
 *
 * "Falta dado?" vem ANTES de "está ligado?". Parece invertido — por que montar o corpo de uma
 * feature desligada? —, mas é o que faz o modo desligado servir para alguma coisa: com ele, a tela
 * já mostra quais viagens ficariam de fora e por quê, dias antes de qualquer chamada real. Se a
 * ordem fosse a outra, o interruptor desligado esconderia justamente o que ele deveria revelar.
 *
 * ── DESLIGADO E TETO SÃO DESFECHOS DIFERENTES ─────────────────────────────────────────────────
 *
 * Os dois não criam, mas dizem coisas distintas: um é "a feature ainda não foi ligada", o outro é
 * "hoje já criou o quanto foi autorizado". Quem olha o registro precisa saber qual dos dois — no
 * primeiro caso espera-se a virada, no segundo espera-se amanhã.
 */
export function decidir(dados: DadosParaSetPreSM, ctx: Contexto): Desfecho {
  const motivos = motivosDeNaoEnviar(dados);
  if (motivos.length > 0) return { tipo: "nao_criar", motivos };

  const corpo = montarCorpoDoSetPreSM(dados);
  /**
   * `motivosDeNaoEnviar` já devolveu lista vazia, então isto só acontece quando falta a
   * CONFIGURAÇÃO — filial ou perfil de segurança. Não é motivo de fila: é defeito de instalação, e
   * a lista vazia é honesta. Mas criar sem corpo seria pior, então para aqui.
   */
  if (!corpo) return { tipo: "nao_criar", motivos: [] };

  const comoObjeto = corpo as unknown as Record<string, unknown>;

  if (!ctx.ativo || !ctx.temCredencial) return { tipo: "desligado", corpo: comoObjeto };
  if (ctx.criadasHoje >= ctx.tetoDiario) return { tipo: "teto_atingido", corpo: comoObjeto };
  return { tipo: "criar", corpo: comoObjeto };
}

/**
 * A chave da rota, no formato que a tabela de correspondências guarda.
 *
 * Mesma normalização do casamento (`tokensDaEstacao`), e por isso está aqui e não copiada: se as
 * duas divergirem, a carga grava com uma chave e a busca procura por outra — e nenhuma rota casa,
 * sem erro nenhum aparecer.
 */
export function chaveDaRota(origem: string | null, destino: string | null): {
  origemNorm: string;
  destinoNorm: string;
} {
  return {
    origemNorm: chaveDaEstacao(origem),
    destinoNorm: chaveDaEstacao(destino),
  };
}
