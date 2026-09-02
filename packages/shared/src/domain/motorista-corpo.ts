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

/**
 * O que impede o envio. Ordem: primeiro o que NÃO se resolve olhando a foto.
 *
 * LISTA EM TEMPO DE EXECUÇÃO, e não só um tipo: a fila traduz cada motivo para português, e um
 * motivo novo sem rótulo apareceria na tela como `sem_toxicologico`. O teste que cobre isso precisa
 * poder percorrer os motivos — um tipo desaparece na compilação e não se percorre.
 */
export const MOTIVOS_DE_NAO_CADASTRAR = [
  "sem_cpf",
  "sem_nome",
  "cpf_divergente",
  "sem_ibge_natal",
  "sem_ibge_residencia",
  "sem_endereco",
  "sem_numero",
  "sem_bairro",
  "sem_cep",
  "sem_nascimento",
  "nascimento_impossivel",
  "sem_sexo",
  "sem_nome_mae",
  "sem_rg",
  "sem_orgao_rg",
  "sem_uf_cnh",
  "sem_validade_cnh",
  "sem_categoria_cnh",
  "sem_primeira_habilitacao",
  "sem_registro_cnh",
  "sem_formulario_cnh",
  "sem_seguranca_cnh",
  "sem_renach",
  "sem_mopp",
  /**
   * OS ANEXOS FALTANDO ou grandes demais (31/08).
   *
   * Obrigatórios pela coluna `Obr. P&C` do manual: sem eles a pesquisa — a metade que custa — nasce
   * incompleta. Bloquear aqui é mais barato do que descobrir depois de pagar.
   */
  "sem_documentos",
  "documentos_grandes",
] as const;

export type MotivoDeNaoCadastrar = (typeof MOTIVOS_DE_NAO_CADASTRAR)[number];

/**
 * OS CAMPOS QUE O CADASTRO USA — a lista fechada, e o motivo de ela ser fechada.
 *
 * Dois lugares dependem disto e precisam concordar: a tela de conferência, que os desenha, e a rota
 * que salva o que a pessoa corrigiu. A rota RECUSA chave que não esteja aqui — sem isso, qualquer
 * requisição feita fora da tela escreveria o que quisesse dentro do `campos` do pré-cadastro, e
 * ninguém descobriria até alguém abrir o JSON meses depois.
 *
 * `cidadeNatal`/`ufNatal` e `cidade`/`uf` não aparecem no corpo do `setMotorista` como texto: elas
 * viram os dois códigos IBGE. Estão aqui porque é a pessoa que as corrige quando o município não
 * casa com o catálogo da gerenciadora.
 */
export const CAMPOS_DO_CADASTRO = [
  "nome",
  "cpf",
  "dataNascimento",
  "sexo",
  "nomeMae",
  "cidadeNatal",
  "ufNatal",
  "rg",
  "orgaoEmissorRg",
  "ufEmissorRg",
  "numeroRegistro",
  "categoria",
  "validade",
  "primeiraHabilitacao",
  "numeroFormulario",
  "numeroSeguranca",
  "renach",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
  "celular",
  "possuiMopp",
  "validadeMopp",
] as const;

export type CampoDoCadastro = (typeof CAMPOS_DO_CADASTRO)[number];

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
  /**
   * OS ANEXOS — e eles são OBRIGATÓRIOS para o nosso caso (31/08, lido no PDF, pág. 52).
   *
   * A tabela do `setMotorista` tem duas colunas de obrigatoriedade, e o bloco `Documentos` marca
   * `N` na primeira e **`S`** na segunda. O rodapé explica a segunda: *"campos obrigatórios quando o
   * cadastro de motorista é destinado ao módulo de Pesquisa e Consulta"* — que é exatamente o nosso.
   *
   * Isso responde a pergunta que estava aberta desde o começo da fatia ("os arquivos são exigidos
   * para a pesquisa?"). Estava escrito no rodapé da tabela o tempo todo, na coluna que ninguém tinha
   * lido — a mesma coluna `Obr. P&C` que já tinha mudado 8 campos obrigatórios para 23.
   *
   * Sem eles a pesquisa nasce incompleta, e a pesquisa é a metade que CUSTA.
   */
  documentos: DocumentoParaEnvio[];
}

/**
 * Um anexo pronto para o corpo: título, extensão e o arquivo em Base64.
 *
 * Os nomes são os do manual, em português e sem acento, como ele os escreve. Traduzi-los aqui
 * obrigaria a destraduzir na montagem.
 */
export interface DocumentoParaEnvio {
  Descricao: string;
  /** PDF, XLSX, XLS, DOC, DOCX, PNG, JPEG, JPG — a lista fechada do manual. */
  Extensao: string;
  Documento: string;
}

/**
 * As extensões que a gerenciadora aceita (manual, pág. 52). Fechada de propósito: um tipo fora dela
 * seria recusado do outro lado, e é melhor descobrir aqui, com o motivo escrito, do que numa recusa
 * que fala de outra coisa.
 */
export const EXTENSOES_ACEITAS = ["PDF", "XLSX", "XLS", "DOC", "DOCX", "PNG", "JPEG", "JPG"] as const;

/**
 * O TETO DO QUE VAI NUMA CHAMADA — 8 MB somando os anexos já em Base64.
 *
 * O manual não diz o limite deles, então este número é NOSSO e conservador. A conta que o justifica:
 * o teto por arquivo é 10 MB, são dois arquivos, e o Base64 infla 33% — o pior caso permitido hoje
 * são 27 MB num único JSON, que qualquer proxy no caminho derruba.
 *
 * Na prática os arquivos são pequenos porque o formulário comprime: os reais medidos são 57 KB e
 * 292 KB, que viram 75 KB e 380 KB. O teto existe para o caso raro, e quando ele bater a pessoa vê
 * o motivo na tela em vez de uma falha de rede sem explicação.
 */
export const TETO_DOS_ANEXOS_BYTES = 8 * 1024 * 1024;

const valor = (c: CamposDoPreCadastro, chave: string): string | null => {
  const v = c[chave]?.valor;
  return v != null && v.trim() !== "" ? v.trim() : null;
};

/**
 * Onze dígitos com verificador — a mesma conta do `cpfSchema`, sem depender do Zod aqui.
 *
 * EXPORTADA em 31/08 para o `pesquisa-corpo.ts` usá-la. Copiar seria o erro clássico deste
 * repositório: duas contas de CPF divergem em silêncio, e a divergência só aparece no dia em que
 * uma aceita o que a outra recusa — com dinheiro em jogo, na pesquisa.
 */
export function cpfValido(bruto: string | null): boolean {
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
/**
 * A data cabe numa vida de motorista? — `false` para o que é impossível, não para o improvável.
 *
 * Aceita `YYYY-MM-DD` e `DD/MM/YYYY`, que são as duas formas que a leitura da CNH e o formulário
 * produzem. Texto que não vira data nenhuma NÃO bloqueia aqui: quem cuida disso é o `sem_nascimento`
 * e o próprio corpo, e dois guardas para a mesma ausência se contradizem no primeiro ajuste.
 */
export function nascimentoPlausivel(texto: string, hoje = new Date()): boolean {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texto);
  const ano = iso ? Number(iso[1]) : br ? Number(br[3]) : null;
  const mes = iso ? Number(iso[2]) : br ? Number(br[2]) : null;
  const dia = iso ? Number(iso[3]) : br ? Number(br[1]) : null;
  if (ano === null || mes === null || dia === null) return true;

  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (Number.isNaN(data.getTime())) return true;
  if (data.getTime() > hoje.getTime()) return false;

  const anos = (hoje.getTime() - data.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
  return anos >= 18 && anos <= 90;
}

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
  /**
   * DATA DE NASCIMENTO POSSÍVEL, e não só presente (2026-09-02).
   *
   * O primeiro cadastro real enviado à gerenciadora foi com "DataNascimento": "2035-04-25" — uma
   * pessoa nascida no futuro. **Ela aceitou**, porque a validação desse campo não existe do lado de
   * lá. O motorista ficou lá dentro com data errada, e desfazer no cadastro DELES custa.
   *
   * A regra é frouxa de propósito: nada de futuro, e nada fora de um intervalo em que um motorista
   * caiba (18 a 90 anos). Não é para adivinhar a data certa — é para pegar o dígito trocado que
   * transforma 1985 em 2035, que foi exatamente o caso.
   */
  const nascimento = valor(c, "dataNascimento");
  if (nascimento && !nascimentoPlausivel(nascimento)) m.push("nascimento_impossivel");
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

  /**
   * OS ANEXOS, pela coluna `Obr. P&C` do manual — ver `DadosParaSetMotorista.documentos`.
   *
   * Vazio bloqueia porque a pesquisa nasceria incompleta. E o teto é conferido sobre o tamanho JÁ
   * EM BASE64, que é o que de fato viaja: medir o arquivo cru esconderia 33% do peso.
   */
  if (d.documentos.length === 0) m.push("sem_documentos");
  else if (d.documentos.reduce((n, a) => n + a.Documento.length, 0) > TETO_DOS_ANEXOS_BYTES) {
    m.push("documentos_grandes");
  }

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
  /** Os anexos exigidos pela coluna `Obr. P&C` — ver `DadosParaSetMotorista.documentos`. */
  Documentos: DocumentoParaEnvio[];
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
    /**
     * OS ANEXOS, no fim do corpo como o exemplo do manual os mostra (`"Documentos": []`).
     *
     * A lista vai como veio: quem monta os anexos é o job, que tem acesso aos arquivos; esta função
     * continua pura e testável sem tocar em disco nem em rede.
     *
     * Nunca é `undefined` — o exemplo do manual traz a chave mesmo vazia, e omitir um campo que o
     * exemplo mostra é o tipo de diferença que produz uma recusa sem dizer qual campo faltou.
     */
    Documentos: d.documentos,
  };
}
