import type { CamposDoPreCadastro } from "./cnh-lida";

/**
 * O CORPO DO `setMotorista`, e os motivos de não dar (2026-08-30, fatia 028, etapa 5).
 *
 * Tudo aqui é **puro**: sem banco, sem rede, sem relógio. É o que permite provar a montagem inteira
 * por teste, num caminho em que a validação de verdade custa caro em outro sentido — a gerenciadora
 * não tem homologação para nós, e cada chamada real cria uma PESSOA no cadastro deles.
 *
 * Segue a forma do `pre-sm-corpo.ts` da 027, e pelo mesmo motivo: isolar o corpo faz uma mudança de
 * contrato custar um arquivo e seus testes, em vez de mudar o job, o que se grava e o que a tela
 * mostra.
 *
 * ── OS 23 CAMPOS SÃO OS DO MÓDULO P&C, NÃO OS DO MÉTODO ───────────────────────────────────────
 *
 * O manual tem DUAS colunas de obrigatoriedade, e a que vale é a segunda: "Obr. P&C — campos
 * obrigatórios quando o cadastro de motorista é destinado ao módulo de Pesquisa e Consulta". É o
 * nosso caso, e é o que faz a lista pular de 8 para 23.
 *
 * Isso só apareceu lendo o PDF: a referência convertida (`INTEGRA-14.2-REFERENCIA.md`) **não tem**
 * o `setMotorista` — a conversão perdeu o método inteiro.
 *
 * ── TODOS OS MOTIVOS, NUNCA O PRIMEIRO ────────────────────────────────────────────────────────
 *
 * Mesma lição da 027: a pessoa está na fila para resolver. Descobrir que falta o RG, resolver, e só
 * então descobrir que também falta o Renach são duas idas em vez de uma.
 */

/** O que impede o envio. Ordem: primeiro o que NÃO se resolve olhando a foto. */
export type MotivoDeNaoCadastrar =
  | "sem_cpf"
  | "sem_nome"
  | "cpf_divergente"
  | "sem_ibge_natal"
  | "sem_ibge_residencia"
  | "sem_endereco"
  | "sem_numero"
  | "sem_bairro"
  | "sem_cep"
  | "sem_nascimento"
  | "sem_sexo"
  | "sem_nome_mae"
  | "sem_rg"
  | "sem_orgao_rg"
  | "sem_uf_cnh"
  | "sem_validade_cnh"
  | "sem_categoria_cnh"
  | "sem_primeira_habilitacao"
  | "sem_registro_cnh"
  | "sem_formulario_cnh"
  | "sem_seguranca_cnh"
  | "sem_renach"
  | "sem_mopp";

/**
 * O que o job junta antes de montar: os campos consolidados mais o que só o banco sabe.
 *
 * Os dois CÓDIGOS IBGE não vêm da foto nem do CEP diretamente — são resolvidos contra o catálogo de
 * 5.571 municípios da gerenciadora (`getCidades`), e por isso chegam prontos. Quem resolve é o job;
 * aqui só se verifica se resolveu.
 */
export interface DadosParaSetMotorista {
  campos: CamposDoPreCadastro;
  /** Da cidade natal lida na CNH. `null` quando o nome não casou com nenhum município. */
  codIbgeNatal: number | null;
  /** Da cidade de residência, que veio do CEP. */
  codIbgeResidencia: number | null;
  /** `true` quando o CPF impresso no documento não bate com o digitado. Ver `cnh-lida.ts`. */
  cpfDivergente: boolean;
}

const valor = (c: CamposDoPreCadastro, chave: string): string | null => {
  const v = c[chave]?.valor;
  return v != null && v.trim() !== "" ? v.trim() : null;
};

/** Onze dígitos com verificador — a mesma conta do `cpfSchema`, sem depender do Zod aqui. */
function cpfValido(bruto: string | null): boolean {
  if (!bruto) return false;
  const d = bruto.replace(/\D+/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (ate: number): number => {
    let s = 0;
    for (let i = 0; i < ate; i++) s += Number(d[i]) * (ate + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/**
 * TUDO o que impede o envio, na ordem em que a tela deve mostrar.
 *
 * A ordem não é alfabética nem a do manual: o que **não se resolve olhando a foto** vem primeiro.
 * CPF divergente e IBGE que não casou exigem decisão de gente; um campo que a leitura não pegou se
 * resolve digitando o que está na imagem ao lado.
 */
export function motivosDeNaoCadastrar(d: DadosParaSetMotorista): MotivoDeNaoCadastrar[] {
  const m: MotivoDeNaoCadastrar[] = [];
  const c = d.campos;

  // ── Primeiro o que precisa de decisão humana ────────────────────────────────────────────────
  if (!cpfValido(valor(c, "cpf"))) m.push("sem_cpf");
  if (!valor(c, "nome")) m.push("sem_nome");
  /**
   * CPF DIVERGENTE BLOQUEIA, e é o único motivo aqui que não é ausência.
   *
   * O documento anexado está no nome de outra pessoa. Enviar assim gastaria uma solicitação de
   * pesquisa — a metade cobrada — para voltar reprovado. Aconteceu no primeiro cadastro real que
   * o formulário recebeu.
   */
  if (d.cpfDivergente) m.push("cpf_divergente");
  if (d.codIbgeNatal == null) m.push("sem_ibge_natal");
  if (d.codIbgeResidencia == null) m.push("sem_ibge_residencia");

  // ── Depois o que se resolve digitando o que está na foto ou no endereço ─────────────────────
  if (!valor(c, "logradouro")) m.push("sem_endereco");
  if (!valor(c, "numero")) m.push("sem_numero");
  if (!valor(c, "bairro")) m.push("sem_bairro");
  if (!valor(c, "cep")) m.push("sem_cep");
  if (!valor(c, "dataNascimento")) m.push("sem_nascimento");
  if (!valor(c, "sexo")) m.push("sem_sexo");
  if (!valor(c, "nomeMae")) m.push("sem_nome_mae");
  if (!valor(c, "rg")) m.push("sem_rg");
  if (!valor(c, "orgaoEmissorRg")) m.push("sem_orgao_rg");
  if (!valor(c, "ufEmissorRg")) m.push("sem_uf_cnh");
  if (!valor(c, "validade")) m.push("sem_validade_cnh");
  if (!valor(c, "categoria")) m.push("sem_categoria_cnh");
  if (!valor(c, "primeiraHabilitacao")) m.push("sem_primeira_habilitacao");
  if (!valor(c, "numeroRegistro")) m.push("sem_registro_cnh");
  if (!valor(c, "numeroFormulario")) m.push("sem_formulario_cnh");
  if (!valor(c, "numeroSeguranca")) m.push("sem_seguranca_cnh");
  if (!valor(c, "renach")) m.push("sem_renach");
  // Declaração, não documento: basta ter sido respondida.
  if (!valor(c, "possuiMopp")) m.push("sem_mopp");

  return m;
}

/**
 * A DATA VAI EM ISO, e eu errei isto antes de ler o exemplo do manual (2026-08-30).
 *
 * Eu tinha convertido para `DD/MM/AAAA`, supondo que uma API brasileira quisesse data brasileira. O
 * exemplo do próprio `setMotorista` mostra o contrário:
 *
 *     "DataNascimento":"1987-07-07"   "DataVencCNH":"2018-11-13"
 *
 * E há evidência mais forte que o manual: o `paraDataHoraDaIntegra` da fatia 026 usa `YYYY-MM-DD`
 * e roda contra a API REAL há dias, criando Pré-SM de verdade. Manual pode estar desatualizado;
 * o que funciona em produção, não.
 *
 * Então isto só valida a forma e repassa. A conversão que eu tinha escrito era trabalho que
 * estragava o dado.
 */
function paraDataDaIntegra(iso: string | null): string | null {
  if (!iso) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

/**
 * O bloco `Motorista`, com os nomes EXATOS — e há um conflito dentro do manual (2026-08-30).
 *
 * A TABELA de layout (pág. 52, versão 14.2) e o EXEMPLO de requisição na mesma seção discordam:
 *
 *     tabela            exemplo         decisão
 *     NumFormCNH        NumDocCNH       manda os DOIS
 *     NumRenachCNH      Renach          manda os DOIS
 *     NumSegurCNH       (ausente)       manda, pela tabela
 *     (ausente)         Fone            manda, pelo exemplo
 *
 * O rodapé do exemplo diz **"Versão 14.0 - 22/10/2025"**, enquanto a tabela é da 14.2 — o exemplo
 * não foi atualizado junto.
 *
 * MANDAR OS DOIS NOMES é a escolha, e não é preguiça de decidir: a API ignora campo que não
 * reconhece (medido no `getCidades`, onde nome de filtro errado é silenciosamente descartado). O
 * risco de mandar um a mais é zero; o de mandar o errado é um cadastro recusado sem dizer qual
 * campo faltou — e sem homologação para descobrir por tentativa.
 *
 * Quando o primeiro cadastro real subir, o retorno diz qual dos dois vale, e o outro sai daqui.
 */
export interface CorpoDoMotorista {
  CPF: string;
  Nome: string;
  Sexo: string;
  RG: string;
  OrgaoEmissRG: string;
  /** `30 = MOTORISTA`, medido em `getTabela(PROFISSOES)` em 28/08. Fixo, nunca adivinhado. */
  CodProfissao: number;
  /** Ver o bloco acima: os dois nomes do número de formulário. */
  NumFormCNH: string;
  NumDocCNH: string;
  NumRegCNH: string;
  NumSegurCNH: string;
  /** Ver o bloco acima: os dois nomes do Renach. */
  NumRenachCNH: string;
  Renach: string;
  UFEmissCNH: string;
  DataVencCNH: string | null;
  CategoriaCNH: string;
  DtPrimEmissCNH: string | null;
  PossuiMOPP: string;
  DtVencMOPP: string | null;
  CodIBGECidadeNatal: number;
  DataNascimento: string | null;
  NomeMae: string;
  Endereco: string;
  Numero: string;
  Complemento: string;
  Bairro: string;
  CodIBGECidade: number;
  CEP: string;
  Celular: string;
}

/** `30 = MOTORISTA` na tabela PROFISSOES. Medido, não suposto. */
export const COD_PROFISSAO_MOTORISTA = 30;

/**
 * Monta o corpo. **Só chame quando `motivosDeNaoCadastrar` devolver lista vazia.**
 *
 * Não valida de novo: quem chama já decidiu. Duplicar a checagem aqui criaria duas verdades sobre o
 * que é "pronto", e o dia em que divergissem seria o dia em que a tela diria "pronto" e o envio
 * falharia sem explicação.
 *
 * DATA AUSENTE VAI COMO `null`, não como string vazia — e isto também eu tinha errado. O exemplo do
 * manual mostra `"DtPrimEmissCNH":null` e `"DtVencMOPP":null`. Mandar `""` num campo de data é
 * pedir para o outro lado tentar interpretar uma data vazia.
 *
 * Texto ausente continua indo VAZIO: é o que o exemplo mostra para os campos de texto.
 *
 * `PossuiMOPP` é 'S'/'N' de uma letra, como o manual pede — não o "sim"/"nao" que o formulário usa.
 */
export function corpoDoMotorista(d: DadosParaSetMotorista): CorpoDoMotorista {
  const c = d.campos;
  const v = (k: string): string => valor(c, k) ?? "";
  const temMopp = valor(c, "possuiMopp") === "sim";

  return {
    CPF: v("cpf").replace(/\D+/g, ""),
    Nome: v("nome"),
    Sexo: v("sexo"),
    RG: v("rg"),
    OrgaoEmissRG: v("orgaoEmissorRg"),
    CodProfissao: COD_PROFISSAO_MOTORISTA,
    // Os dois nomes de cada um: a tabela e o exemplo do manual discordam. Ver o bloco acima.
    NumFormCNH: v("numeroFormulario"),
    NumDocCNH: v("numeroFormulario"),
    NumRegCNH: v("numeroRegistro"),
    NumSegurCNH: v("numeroSeguranca"),
    NumRenachCNH: v("renach"),
    Renach: v("renach"),
    UFEmissCNH: v("ufEmissorRg"),
    DataVencCNH: paraDataDaIntegra(valor(c, "validade")),
    CategoriaCNH: v("categoria"),
    DtPrimEmissCNH: paraDataDaIntegra(valor(c, "primeiraHabilitacao")),
    PossuiMOPP: temMopp ? "S" : "N",
    // Só quem tem MOPP manda validade. Data sem o curso correspondente é dado que ninguém pediu.
    DtVencMOPP: temMopp ? paraDataDaIntegra(valor(c, "validadeMopp")) : null,
    CodIBGECidadeNatal: d.codIbgeNatal!,
    DataNascimento: paraDataDaIntegra(valor(c, "dataNascimento")),
    NomeMae: v("nomeMae"),
    Endereco: v("logradouro"),
    Numero: v("numero"),
    Complemento: v("complemento"),
    Bairro: v("bairro"),
    CodIBGECidade: d.codIbgeResidencia!,
    CEP: v("cep"),
    Celular: v("celular").replace(/\D+/g, ""),
  };
}
