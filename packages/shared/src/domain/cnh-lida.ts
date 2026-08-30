import { z } from "zod";

/**
 * O QUE SE LÊ DE UMA CNH, e o que se faz com o que não se conseguiu ler (fatia 028, etapa 3).
 *
 * Este arquivo é PURO: define a forma da leitura e como ela se funde ao que já se sabe. Quem fala
 * com o provedor é o worker. A separação existe porque tudo que decide algo aqui pode ser testado
 * sem gastar uma chamada paga — e o que gasta não decide nada.
 *
 * ── A REGRA QUE MANDA EM TUDO AQUI ────────────────────────────────────────────────────────────
 *
 * Campo não lido fica VAZIO E ASSINALADO, nunca inventado. Um valor plausível e errado é pior do
 * que um vazio, porque ninguém confere o que parece certo — quem revisa passa o olho, vê um RG bem
 * formado no lugar certo e segue adiante. O vazio interrompe; o palpite não.
 *
 * Por isso o campo não lido continua EXISTINDO na estrutura, com `valor: null` e `origem: null`.
 * Omiti-lo faria a tela não distinguir "não tentamos" de "tentamos e não deu".
 *
 * ── HERDADO DA FATIA 021, com uma decisão revogada ────────────────────────────────────────────
 *
 * Da 021 vêm: leitura no servidor, saída validada por esquema, preenchimento para CONFERÊNCIA
 * humana (a leitura nunca cria cadastro sozinha), e degradação limpa quando não há credencial.
 *
 * O que NÃO vale mais é o FR-005 dela — "a imagem não é guardada em lugar nenhum". Ali o documento
 * era do funcionário, ia ao provedor e sumia. Aqui ele chega do MOTORISTA por um formulário
 * público, e é a prova do que ele mandou: fica no bucket privado da fatia 025. Revogar isso é
 * deliberado, e está escrito para ninguém "corrigir" de volta.
 */

/** As cinco procedências de um valor. Ver `data-model.md`. */
export const ORIGENS = ["cnh", "cep", "digitado", "declarado", "existente"] as const;
export type Origem = (typeof ORIGENS)[number];

/**
 * Um campo com a sua procedência. `valor: null` + `origem: null` é o campo TENTADO E NÃO LIDO.
 *
 * `declarado` não é `digitado`: o primeiro é o que o motorista afirmou e ninguém conferiu (MOPP,
 * toxicológico); o segundo é alguém do escritório preenchendo com o documento à vista. Misturá-los
 * faria a conferência tratar uma afirmação sem prova como fato verificado.
 */
export interface CampoComOrigem {
  valor: string | null;
  origem: Origem | null;
}

export type CamposDoPreCadastro = Record<string, CampoComOrigem>;

/**
 * OS CATORZE CAMPOS que a CNH carrega e a gerenciadora exige.
 *
 * Conferidos contra o `setMotorista` da Integra (manual em PDF, pág. 52). Não é uma lista de "o que
 * seria bom ter": é o que falta para o cadastro ser aceito do outro lado.
 *
 * Todos OPCIONAIS de propósito. O modelo devolve o que conseguiu ler, e a ausência é informação —
 * exigir um campo aqui faria a validação inteira falhar por causa de uma foto com reflexo no canto,
 * jogando fora os treze campos que foram lidos bem.
 */
export const cnhLidaSchema = z.object({
  nome: z.string().trim().min(1).nullable().optional(),
  cpf: z.string().trim().nullable().optional(),
  dataNascimento: z.string().trim().nullable().optional(),
  sexo: z.enum(["M", "F"]).nullable().optional(),
  rg: z.string().trim().nullable().optional(),
  orgaoEmissorRg: z.string().trim().nullable().optional(),
  ufEmissorRg: z.string().trim().nullable().optional(),
  nomeMae: z.string().trim().nullable().optional(),
  nomePai: z.string().trim().nullable().optional(),
  cidadeNatal: z.string().trim().nullable().optional(),
  ufNatal: z.string().trim().nullable().optional(),
  numeroRegistro: z.string().trim().nullable().optional(),
  numeroFormulario: z.string().trim().nullable().optional(),
  numeroSeguranca: z.string().trim().nullable().optional(),
  renach: z.string().trim().nullable().optional(),
  categoria: z.string().trim().nullable().optional(),
  validade: z.string().trim().nullable().optional(),
  primeiraHabilitacao: z.string().trim().nullable().optional(),
});

export type CnhLida = z.infer<typeof cnhLidaSchema>;

/** A ordem em que a conferência desenha os campos, e o rótulo de cada um. */
export const CAMPOS_DA_CNH: ReadonlyArray<{ chave: keyof CnhLida; rotulo: string }> = [
  { chave: "nome", rotulo: "Nome" },
  { chave: "cpf", rotulo: "CPF" },
  { chave: "dataNascimento", rotulo: "Nascimento" },
  { chave: "sexo", rotulo: "Sexo" },
  { chave: "nomeMae", rotulo: "Nome da mãe" },
  { chave: "nomePai", rotulo: "Nome do pai" },
  { chave: "rg", rotulo: "RG" },
  { chave: "orgaoEmissorRg", rotulo: "Órgão emissor" },
  { chave: "ufEmissorRg", rotulo: "UF do RG" },
  { chave: "cidadeNatal", rotulo: "Cidade natal" },
  { chave: "ufNatal", rotulo: "UF natal" },
  { chave: "numeroRegistro", rotulo: "Nº de registro" },
  { chave: "numeroFormulario", rotulo: "Nº do formulário" },
  { chave: "numeroSeguranca", rotulo: "Nº de segurança" },
  { chave: "renach", rotulo: "Renach" },
  { chave: "categoria", rotulo: "Categoria" },
  { chave: "validade", rotulo: "Validade" },
  { chave: "primeiraHabilitacao", rotulo: "1ª habilitação" },
];

/** Só dígitos — o que a CNH imprime com pontuação e o cadastro guarda sem. */
const apenasDigitos = (v: string): string => v.replace(/\D+/g, "");

/**
 * "10/05/1987" → "1987-05-10". Devolve `null` para qualquer coisa que não seja uma data brasileira
 * completa — inclusive "10/05/87", porque adivinhar o século é exatamente o tipo de palpite que
 * este arquivo existe para impedir.
 */
export function dataBrParaIso(bruto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(bruto.trim());
  if (!m) return null;
  const [, d, mes, a] = m;
  const dia = Number(d);
  const mm = Number(mes);
  if (mm < 1 || mm > 12 || dia < 1 || dia > 31) return null;
  return `${a}-${mes}-${d}`;
}

const DATAS: ReadonlySet<string> = new Set([
  "dataNascimento",
  "validade",
  "primeiraHabilitacao",
]);

/**
 * A leitura vira campos com origem — e o que não veio vira campo VAZIO E ASSINALADO.
 *
 * Percorre a lista canônica, e não as chaves que o modelo devolveu: assim um campo que ele
 * simplesmente omitiu aparece como não lido, em vez de desaparecer. É a diferença entre a tela
 * dizer "não consegui ler o Renach" e não mencionar o Renach nunca.
 *
 * Normaliza o que tem forma conhecida: datas para ISO, CPF para dígitos. O que não normaliza vem
 * como está — inventar formato para um campo que a gerenciadora aceita como texto seria estragar o
 * dado por zelo.
 */
export function camposDaLeitura(lida: CnhLida): CamposDoPreCadastro {
  const saida: CamposDoPreCadastro = {};
  for (const { chave } of CAMPOS_DA_CNH) {
    const bruto = lida[chave];
    if (bruto == null || String(bruto).trim() === "") {
      saida[chave] = { valor: null, origem: null };
      continue;
    }
    const texto = String(bruto).trim();
    let valor: string | null = texto;
    if (DATAS.has(chave)) valor = dataBrParaIso(texto) ?? (/^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null);
    if (chave === "cpf") valor = apenasDigitos(texto).length === 11 ? apenasDigitos(texto) : null;
    // Normalização que falhou é campo NÃO LIDO, não campo com lixo dentro: uma data ilegível
    // gravada como "1O/O5/87" atravessaria a conferência e só quebraria no envio à gerenciadora.
    saida[chave] = valor === null ? { valor: null, origem: null } : { valor, origem: "cnh" };
  }
  return saida;
}

/**
 * Funde a leitura ao que JÁ se sabe, e o que já se sabe SEMPRE vence.
 *
 * O motorista digitou o próprio CPF e o próprio celular; a leitura da foto não substitui isso. Duas
 * razões, e a segunda é a que importa: o CPF digitado é o que decidiu se este é cadastro novo ou
 * atualização — se a leitura o sobrescrevesse, a linha passaria a ter uma chave diferente daquela
 * pela qual foi criada, e ninguém entenderia por quê.
 *
 * Um campo que a leitura não conseguiu ler NÃO apaga o que já existia: `null` da leitura sobre um
 * valor existente é ruído, não informação.
 */
export function fundirCampos(
  existentes: CamposDoPreCadastro,
  daLeitura: CamposDoPreCadastro,
): CamposDoPreCadastro {
  const saida: CamposDoPreCadastro = { ...daLeitura };
  for (const [chave, campo] of Object.entries(existentes)) {
    if (campo && campo.valor != null) saida[chave] = campo;
  }
  // Um campo que só a leitura tentou e não leu continua assinalado, para a tela poder mostrá-lo.
  for (const [chave, campo] of Object.entries(daLeitura)) {
    if (!(chave in saida)) saida[chave] = campo;
  }
  return saida;
}

/**
 * O CPF DO DOCUMENTO CONFERE COM O QUE A PESSOA DIGITOU? (2026-08-30)
 *
 * ── O CASO QUE FEZ ISTO EXISTIR ───────────────────────────────────────────────────────────────
 *
 * O primeiro cadastro real recebido veio preenchido com um nome e um CPF, e a foto anexada era a
 * CNH de OUTRA PESSOA — nome diferente, CPF diferente, nada em comum. Só apareceu porque alguém
 * abriu o arquivo e olhou. Um cadastro assim atravessaria a conferência apressada, seria enviado à
 * gerenciadora e voltaria reprovado — gastando uma solicitação de pesquisa para descobrir o que
 * esta função descobre de graça.
 *
 * ── POR QUE SÓ O CPF, E NÃO O NOME ────────────────────────────────────────────────────────────
 *
 * CPF são onze dígitos: ou são iguais ou não são, sem meio-termo. Nome tem abreviação, acento,
 * ordem trocada e erro de digitação — comparar nomes produziria divergência em cadastro legítimo,
 * e um aviso que grita à toa é um aviso que as pessoas aprendem a ignorar. Quando o aviso do CPF
 * aparecer, ele vai estar certo.
 *
 * ── ISTO NÃO BLOQUEIA NADA ────────────────────────────────────────────────────────────────────
 *
 * Devolve um fato, não um veredito. Quem decide é a pessoa na conferência: pode ser fraude, pode
 * ser arquivo trocado, pode ser o motorista que anexou a CNH do irmão por engano. O sistema não
 * tem como saber qual — e recusar sozinho transformaria um engano comum em porta fechada.
 */
export type ConferenciaDeCpf =
  | { estado: "confere" }
  | { estado: "diverge"; cpfNoDocumento: string }
  | { estado: "nao_lido" };

export function conferirCpfDoDocumento(cpfDigitado: string, lida: CnhLida): ConferenciaDeCpf {
  const doDocumento = lida.cpf == null ? "" : apenasDigitos(String(lida.cpf));
  // Não ter lido o CPF não é divergência: é ausência de informação, e acusar por ausência seria
  // exatamente o palpite que este arquivo inteiro existe para impedir.
  if (doDocumento.length !== 11) return { estado: "nao_lido" };
  const digitado = apenasDigitos(cpfDigitado);
  return doDocumento === digitado ? { estado: "confere" } : { estado: "diverge", cpfNoDocumento: doDocumento };
}

/** Quantos dos campos da CNH saíram legíveis — é o que a fila mostra como "12 de 18". */
export function quantosLidos(campos: CamposDoPreCadastro): { lidos: number; total: number } {
  let lidos = 0;
  for (const { chave } of CAMPOS_DA_CNH) {
    if (campos[chave]?.valor != null) lidos++;
  }
  return { lidos, total: CAMPOS_DA_CNH.length };
}
