import { cpfValido } from "./motorista-corpo";
import type { CamposDoPreCadastro } from "./cnh-lida";

/**
 * O PEDIDO DE PESQUISA e tudo o que impede fazê-lo (fatia 028, etapa 6).
 *
 * ── ESTA É A METADE QUE CUSTA ─────────────────────────────────────────────────────────────────
 *
 * O `setMotorista` cria a pessoa na gerenciadora e é de graça (decisão D7). Esta chamada é a que
 * eles cobram, por solicitação, e não há homologação: a primeira execução já é uma cobrança real.
 *
 * A consequência para este arquivo é direta — ele existe para que a decisão de gastar seja tomada
 * por uma função pura, sob teste, e não no meio de um job. Tudo o que decide algo mora aqui; o que
 * fala com a rede não decide nada.
 *
 * ── TODOS OS MOTIVOS, NUNCA O PRIMEIRO ────────────────────────────────────────────────────────
 *
 * Mesma lição da 027 e do `motorista-corpo.ts`: a pessoa está na tela para resolver. Descobrir que
 * falta o vínculo, resolver, e só então descobrir que o cadastro nem foi enviado são duas idas em
 * vez de uma — e aqui a segunda ida custaria a paciência de quem está prestes a gastar dinheiro.
 */

/** O que impede pedir a pesquisa. Ordem: primeiro o que não se resolve nesta tela. */
export const MOTIVOS_DE_NAO_PESQUISAR = [
  "nao_enviado",
  "ja_pedida",
  "cpf_divergente",
  "sem_cpf",
  "sem_vinculo",
] as const;

export type MotivoDeNaoPesquisar = (typeof MOTIVOS_DE_NAO_PESQUISAR)[number];

/** F, A ou T — a mesma letra que a 026 já usa em `drivers.ownershipType`. */
export const VINCULOS_DA_PESQUISA = ["F", "A", "T"] as const;
export type VinculoDaPesquisa = (typeof VINCULOS_DA_PESQUISA)[number];

/**
 * AS TRÊS OPÇÕES QUE MUDAM O PREÇO.
 *
 * Nenhuma tem padrão neste arquivo, e isso é deliberado: um `?? false` escondido aqui seria uma
 * escolha de gasto tomada pelo código. Quem chama passa o que a pessoa marcou na tela, e o que ela
 * marcou fica gravado junto do pedido — para o dia em que a fatura vier com uma linha que ninguém
 * lembra de ter pedido.
 */
export interface OpcoesDaPesquisa {
  expressa: boolean;
  pesquisaPlus: boolean;
  biometrica: boolean;
}

export interface DadosParaPesquisa {
  campos: CamposDoPreCadastro;
  /** O CPF pelo qual o pré-cadastro foi criado — a chave, não o que a CNH disser. */
  cpf: string;
  /** Já foi criado na gerenciadora? Sem isso não há a quem pesquisar. */
  enviadoAGerenciadora: boolean;
  /** Já existe pedido de pesquisa nesta linha? */
  jaPedida: boolean;
  /** A CNH trouxe um CPF diferente do declarado? */
  cpfDivergente: boolean;
  vinculo: VinculoDaPesquisa | null;
}

export function motivosDeNaoPesquisar(d: DadosParaPesquisa): MotivoDeNaoPesquisar[] {
  const m: MotivoDeNaoPesquisar[] = [];

  /**
   * PESQUISAR QUEM NÃO FOI CADASTRADO é gastar por nada: a gerenciadora não tem a quem associar o
   * resultado. É o primeiro da lista porque não se resolve nesta tela — resolve-se enviando antes.
   */
  if (!d.enviadoAGerenciadora) m.push("nao_enviado");

  /**
   * JÁ PEDIDA: o segundo clique custaria uma segunda pesquisa. A trava de verdade é a reivindicação
   * no banco (`WHERE pesquisa_solicitada_em IS NULL`), porque duas abas abertas passam por qualquer
   * verificação feita antes. Esta aqui é a que explica na tela, não a que garante.
   */
  if (d.jaPedida) m.push("ja_pedida");

  /**
   * O CPF DIVERGENTE BLOQUEIA, e aqui dói mais do que no cadastro: pesquisar o CPF errado gasta
   * dinheiro para receber o resultado de outra pessoa. Foi exatamente o caso do primeiro cadastro
   * real — CNH com CPF diferente do digitado, os dois válidos.
   */
  if (d.cpfDivergente) m.push("cpf_divergente");

  if (!cpfValido(d.cpf)) m.push("sem_cpf");

  /**
   * O VÍNCULO É OBRIGATÓRIO no método e o formulário NÃO o pergunta — o motorista não sabe se é
   * frota, agregado ou terceiro; quem sabe é quem contrata. Por isso ele é escolhido na hora do
   * pedido, e por isso a ausência é motivo e não um chute para "T".
   */
  if (!d.vinculo) m.push("sem_vinculo");

  return m;
}

/**
 * O CORPO DO PEDIDO, com os nomes exatos do manual (pág. 144).
 *
 * `TipoIdentificacao: "P"` é pessoa — o mesmo método pesquisa veículo ("V") e carreta ("C"), e é o
 * tipo que decide o que `Identificacao` significa. Aqui é sempre motorista, e mandar o CPF num
 * pedido marcado como veículo devolveria um erro que fala de placa.
 *
 * O CPF vai SÓ COM DÍGITOS. O manual reserva 14 caracteres para caber CNPJ; a pontuação nunca fez
 * parte do valor, e mandá-la é apostar que o outro lado limpa.
 */
export interface CorpoDaPesquisa {
  CodFilial: number;
  TipoIdentificacao: "P";
  Identificacao: string;
  Vinculo: VinculoDaPesquisa;
  Expressa: "S" | "N";
  PesquisaPlus: "S" | "N";
  PesquisaBiometrica: "S" | "N";
}

/** O código da filial, medido em produção: 9332 = 03571231000143-BRAZIL TRANSPORTS LTDA. */
export const COD_FILIAL = 9332;

const sn = (v: boolean): "S" | "N" => (v ? "S" : "N");

export function corpoDaPesquisa(
  d: DadosParaPesquisa,
  opcoes: OpcoesDaPesquisa,
): CorpoDaPesquisa {
  return {
    CodFilial: COD_FILIAL,
    TipoIdentificacao: "P",
    Identificacao: d.cpf.replace(/\D/g, ""),
    // `motivosDeNaoPesquisar` já barrou o nulo; o `!` aqui é consequência dela, não descuido.
    Vinculo: d.vinculo!,
    Expressa: sn(opcoes.expressa),
    PesquisaPlus: sn(opcoes.pesquisaPlus),
    PesquisaBiometrica: sn(opcoes.biometrica),
  };
}

/**
 * AS SITUAÇÕES QUE A GERENCIADORA DEVOLVE, com o que elas querem dizer (manual, pág. 144 e 147).
 *
 * Guardadas aqui porque a tela precisa dizer o que aconteceu em português, e porque um código
 * desconhecido tem de aparecer como ele mesmo em vez de virar "outro" — é assim que se aprende um
 * código novo a partir do dado real, em vez de descobrir tarde que ele existia.
 */
export const SITUACOES_DA_PESQUISA: Record<string, string> = {
  SP: "Sem pesquisa",
  EP: "Em pesquisa",
  AP: "Aguardando pesquisa",
  NA: "Inconclusivo",
  AD: "Adequado ao risco",
  EX: "Expirado",
  AC: "A consultar",
  B: "Análise biométrica",
};
