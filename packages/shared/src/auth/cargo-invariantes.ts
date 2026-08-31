import type { PermissionKey } from "./permissions";

/**
 * A CAPACIDADE QUE NÃO PODE FALTAR NA EMPRESA.
 *
 * Quem a tem consegue criar cargo, mover pessoa e conceder qualquer outra capacidade. Ficar sem
 * ninguém que a tenha é a única falha desta fatia que **não se conserta por dentro do sistema** —
 * ninguém consegue entrar para desfazer, porque desfazer exige exatamente ela.
 */
export const CAPACIDADE_DE_ADMINISTRAR: PermissionKey = "manage_users";

/**
 * OS MOTIVOS PELOS QUAIS UMA MUDANÇA DE ACESSO É RECUSADA.
 *
 * Códigos, e não frases: quem monta a frase é a tela, em português, com o nome do cargo e da pessoa
 * que ela tem em mãos. Uma mensagem montada aqui chegaria genérica ("não é possível") ou obrigaria
 * este arquivo a saber de nomes que ele não tem.
 */
/*
  `DeCargo` no nome porque `MotivoDeRecusa` já existe em `portal-acceptance.ts`, e é outra coisa
  inteiramente: os motivos pelos quais SE RECUSA UMA VIAGEM do portal. Dois tipos com o mesmo nome no
  mesmo pacote é um deles ser importado por engano num dia apressado.
*/
export type MotivoDeRecusaDeCargo =
  | "ULTIMO_ADMIN"
  | "CARGO_COM_PESSOAS"
  | "ALEM_DO_PROPRIO_ACESSO"
  | "PERMISSAO_DESCONHECIDA";

/**
 * A DECISÃO SOBRE UMA MUDANÇA DE ACESSO — pura, sem banco, no espírito do `pre-sm-corpo.ts` da 027.
 *
 * ── DEVOLVE TODOS OS MOTIVOS, E NÃO O PRIMEIRO ────────────────────────────────────────────────
 *
 * Recusar por um motivo de cada vez faz a pessoa corrigir, tentar de novo, e descobrir o seguinte —
 * três idas até entender o que era preciso. A tela mostra tudo de uma vez.
 *
 * ── ESTA FUNÇÃO NÃO SABE CONTAR ADMINISTRADORES, E É DE PROPÓSITO ─────────────────────────────
 *
 * Quem conta é o banco, DEPOIS da escrita, dentro da transação (ver `ainda-tem-admin.ts`). O motivo
 * está lá e é a corrida de duas abas: contar antes deixa as duas passarem e a empresa acabar com
 * zero. O que esta função recebe é o resultado dessa contagem, já feito.
 */
export interface EstadoDaMudanca {
  /** As capacidades que a mudança quer conceder ao cargo. */
  concedidas: readonly string[];
  /** O catálogo inteiro — nada fora dele pode ser concedido (FR-002). */
  catalogo: readonly string[];
  /** O que quem está editando alcança. Ninguém concede o que não tem (FR-012). */
  doEditor: ReadonlySet<PermissionKey>;
  /**
   * Quantas pessoas ATIVAS ainda administrariam depois desta mudança. Contado pelo banco.
   * `null` quando a operação não mexe em administração e a contagem não foi feita.
   */
  administradoresDepois: number | null;
  /** Quantas pessoas ficariam no cargo que se quer desativar, sem destino declarado. */
  pessoasSemDestino?: number;
}

/**
 * Todos os motivos para recusar. Lista vazia = pode gravar.
 */
export function motivosParaRecusar(estado: EstadoDaMudanca): MotivoDeRecusaDeCargo[] {
  const motivos: MotivoDeRecusaDeCargo[] = [];

  /**
   * Uma chave fora do catálogo nunca seria concedida por `can` — ela falharia FECHADA, sem erro.
   * Recusar na entrada é o que transforma um engano silencioso numa mensagem.
   */
  if (estado.concedidas.some((p) => !estado.catalogo.includes(p))) {
    motivos.push("PERMISSAO_DESCONHECIDA");
  }

  /**
   * NINGUÉM AMPLIA O PRÓPRIO ALCANCE (FR-012).
   *
   * Sem isto, qualquer pessoa que administre usuários se concede tudo em dois cliques — e a
   * separação de cargos vira decoração. A regra vale mesmo para quem administra: ela limita o que se
   * pode DAR, não o que se pode ver.
   */
  if (estado.concedidas.some((p) => !estado.doEditor.has(p as PermissionKey))) {
    motivos.push("ALEM_DO_PROPRIO_ACESSO");
  }

  /**
   * A TRAVA DO ÚLTIMO ADMINISTRADOR (FR-010).
   *
   * Vale para os quatro caminhos, e é por isso que ela mora num lugar só: desativar o cargo que
   * administra, tirar a capacidade dele, mover a última pessoa para outro cargo, e desativar essa
   * pessoa. Quatro rotas diferentes, uma pergunta só — "depois disto, ainda sobra alguém?".
   */
  if (estado.administradoresDepois !== null && estado.administradoresDepois < 1) {
    motivos.push("ULTIMO_ADMIN");
  }

  /**
   * NINGUÉM FICA SEM CARGO (FR-011). Quem fica sem cargo fica com conjunto vazio — entra no sistema
   * e não vê nada. Desativar um cargo com gente dentro exige dizer para onde essas pessoas vão.
   */
  if ((estado.pessoasSemDestino ?? 0) > 0) motivos.push("CARGO_COM_PESSOAS");

  return motivos;
}
