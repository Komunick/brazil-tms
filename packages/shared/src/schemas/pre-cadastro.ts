import { z } from "zod";
import { cpfSchema, dateStringSchema, phoneSchema } from "./master-data";

/**
 * O QUE O FORMULÁRIO PÚBLICO MANDA, revalidado do lado de cá (fatia 028).
 *
 * O contrato publicado está em `specs/028-fila-cadastro-motorista/contracts/pre-cadastro.md`; este
 * arquivo é a versão executável dele, e as duas têm de concordar.
 *
 * ── ISTO REVALIDA TUDO, INCLUSIVE O QUE O FORMULÁRIO JÁ VALIDOU ───────────────────────────────
 *
 * O formulário vive em OUTRO repositório e valida CPF, celular e CEP antes de mandar — não porque o
 * servidor confie nele, mas para a pessoa não descobrir o erro depois de subir duas fotos num 4G de
 * evento. Uma requisição feita fora do site chega exatamente igual à feita por dentro, e é por isso
 * que nada aqui pode presumir que já foi conferido.
 *
 * `cpfSchema` e `phoneSchema` são os MESMOS do cadastro interno, de propósito. Um segundo validador
 * de CPF divergiria em silêncio do primeiro, e o dia em que divergisse seria o dia em que o mesmo
 * motorista entraria duas vezes na fila.
 *
 * ── O QUE NÃO SE PEDE ─────────────────────────────────────────────────────────────────────────
 *
 * Nascimento, RG, nome da mãe, Renach, categoria e validade da CNH NÃO estão aqui. Tudo isso está
 * impresso na foto que a pessoa acabou de tirar, e é lido dela depois (etapa P2). Pedir ao motorista
 * o que ele já fotografou é trabalho jogado fora — e num estande é o que faz desistir no meio.
 */

/** MOPP e toxicológico são DECLARAÇÕES: a pessoa diz se tem e até quando. Nada é conferido aqui. */
const simNao = z.enum(["sim", "nao"]);

export const preCadastroSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(3, "Informe o nome completo.")
      .max(100, "Nome longo demais (máximo 100)."),
    cpf: cpfSchema,
    celular: phoneSchema,
    /**
     * O CEP resolve endereço, bairro, cidade, UF **e o código IBGE** no ViaCEP — e é justamente o
     * `CodIBGECidade` que a gerenciadora exige. Aqui só o formato: a consulta é de outra etapa.
     */
    cep: z
      .string()
      .trim()
      .transform((s) => s.replace(/[-\s.]/g, ""))
      .pipe(z.string().regex(/^\d{8}$/, "CEP deve ter 8 dígitos.")),
    /**
     * O NÚMERO DA CASA — e por que ele existe aqui (2026-08-30).
     *
     * Descoberto lendo o `setMotorista` no PDF do manual: `Numero` é **obrigatório** quando o
     * cadastro vai para o módulo de Pesquisa e Consulta, que é o nosso caso. E ele não sai de
     * lugar nenhum: não está impresso na CNH, o ViaCEP não devolve, e o formulário não perguntava.
     * Sem ele nenhum cadastro pode ser enviado à gerenciadora.
     *
     * TEXTO e não número, com folga de 15 caracteres (o teto do manual): "S/N", "120A" e "km 12"
     * são endereços reais, e um campo numérico os recusaria.
     *
     * ── OPCIONAL AQUI, OBRIGATÓRIO NO FORMULÁRIO, E ISSO É DE PROPÓSITO ───────────────────────
     *
     * O formulário já está no ar recebendo cadastros de verdade. Exigir o campo no servidor antes
     * de o site passar a mandá-lo quebraria o envio de quem estivesse preenchendo naquele momento —
     * e a pessoa não teria como saber por quê.
     *
     * Então o servidor aceita sem exigir, o formulário exige de quem preenche, e a conferência
     * pega os poucos que chegarem sem. Apertar aqui é uma linha, quando o site estiver publicado
     * há tempo suficiente para não haver ninguém com a versão antiga aberta.
     */
    numero: z.string().trim().max(15, "Número longo demais.").optional(),
    /**
     * O ENDEREÇO POR EXTENSO — preenchido pelo CEP, mas EDITÁVEL (2026-08-30, a pedido).
     *
     * O ViaCEP resolve logradouro, bairro, cidade e UF a partir do CEP, e o formulário preenche
     * sozinho. Mas o resultado nem sempre está certo: CEP de logradouro longo devolve o nome da
     * rua sem o trecho, CEP único de cidade pequena devolve vazio, e loteamento novo às vezes
     * ainda não está na base. Travar o campo depois de preencher faria a pessoa mandar um endereço
     * que ela SABE estar errado — e ninguém do outro lado teria como adivinhar.
     *
     * Por isso os campos chegam aqui como texto livre: o que vale é o que a pessoa confirmou na
     * tela, não o que o CEP sugeriu.
     *
     * Os tamanhos são os do `setMotorista` (manual, pág. 52): Endereco 200, Bairro 100. Cortar
     * aqui é melhor do que a gerenciadora recusar o cadastro inteiro por um campo longo demais.
     */
    logradouro: z.string().trim().max(200, "Logradouro longo demais.").optional(),
    complemento: z.string().trim().max(50, "Complemento longo demais.").optional(),
    bairro: z.string().trim().max(100, "Bairro longo demais.").optional(),
    cidade: z.string().trim().max(100, "Cidade longa demais.").optional(),
    /** Sigla de duas letras. Vira maiúscula aqui para não depender de como foi digitada. */
    /**
     * VAZIO É AUSÊNCIA, e não um valor inválido (2026-08-30, achado em produção).
     *
     * `.optional()` do Zod só pula `undefined`. Uma string vazia CAI na regra de duas letras,
     * falha, e derruba o envio inteiro — com `sem_ciencia_de_erro`, que não explica nada.
     *
     * E o formulário manda vazio com facilidade: quando o CEP não resolve, os campos ficam em
     * branco (o do primeiro cadastro real recebido, `40390-294`, o ViaCEP não conhece). Um `<input>`
     * vazio vira `""` no `FormData`, nunca `undefined`.
     *
     * Ou seja: bastava alguém com CEP desconhecido para perder o cadastro. O `transform` para
     * `undefined` é o que separa "não informou" de "informou errado" — e só o segundo deve recusar.
     */
    /**
     * AUSENTE E VAZIO SÃO A MESMA COISA AQUI — e só o segundo funcionava (30/08).
     *
     * O `.optional()` estava DENTRO do pipe, depois do transform: o `z.string()` de fora continuava
     * obrigatório. `uf: ""` passava; `uf` ausente devolvia "Required", e o envio inteiro caía por
     * causa de uma chave que ninguém prometeu mandar.
     *
     * Nunca apareceu porque o `FormData` manda todo campo do formulário, mesmo vazio. Apareceu ao
     * escrever um teste que montava o corpo à mão — que é exatamente o que uma requisição feita
     * fora do site faz.
     *
     * É o MESMO defeito que o `""` já tinha causado uma vez, um passo antes na cadeia: lá o vazio
     * caía na regra de duas letras e derrubava o cadastro de quem tem CEP desconhecido. Aqui é a
     * ausência. Os dois custam a mesma coisa — o envio inteiro — por um campo opcional.
     */
    uf: z
      .string()
      .trim()
      .optional()
      .transform((s) => (s == null || s === "" ? undefined : s.toUpperCase()))
      .pipe(z.string().regex(/^[A-Z]{2}$/, "UF deve ter 2 letras.").optional()),
    possuiMopp: simNao,
    validadeMopp: dateStringSchema.optional(),
    /**
     * O toxicológico NÃO EXISTE na API da gerenciadora — zero ocorrências no manual inteiro. Ele
     * mora só na tela deles. Capturar a declaração aqui é o que permite marcar a pendência como
     * ação manual, em vez de inventar um endpoint que não existe.
     */
    possuiToxicologico: simNao,
    validadeToxicologico: dateStringSchema.optional(),
    /**
     * A ciência sobre coleta e uso dos dados. Sem ela o envio é recusado — e isso é regra do
     * servidor, não uma caixinha que o formulário pode decidir dispensar.
     */
    ciencia: z.literal("true", { message: "É preciso marcar a ciência sobre o uso dos dados." }),
  })
  /**
   * Quem diz que TEM precisa dizer até quando. Quem diz que não tem não manda validade nenhuma —
   * uma validade sem o documento correspondente é dado que ninguém pediu e que a conferência
   * trataria como verdade.
   */
  .refine((v) => v.possuiMopp === "nao" || !!v.validadeMopp, {
    message: "Informe a validade do MOPP.",
    path: ["validadeMopp"],
  })
  .refine((v) => v.possuiToxicologico === "nao" || !!v.validadeToxicologico, {
    message: "Informe a validade do exame toxicológico.",
    path: ["validadeToxicologico"],
  })
  /**
   * "TENHO" + UMA DATA QUE JÁ PASSOU É CONTRADIÇÃO (30/08, achado no primeiro cadastro real).
   *
   * O Alexandre mandou `possuiMopp: sim` com `validadeMopp: 1990-01-01`. Nos DOIS envios. E o TMS
   * aceitou calado as duas vezes — a validação só exigia que a data EXISTISSE.
   *
   * ── DE ONDE VEM A DATA DE 1990 ────────────────────────────────────────────────────────────
   *
   * Não é padrão do formulário: os dois campos são `<input type="date">` crus, sem `value`, `min`
   * nem `max` (conferido na página em produção). É o seletor nativo do celular, que abre num ano
   * baixo — um toque desatento cai em 01/01/1990 e ninguém percebe.
   *
   * Por isso a regra mora AQUI e não só no formulário: o formulário pode ganhar um `min` amanhã, e
   * ainda assim uma requisição feita fora dele chegaria igual. É a armadilha 2 desta fatia — o TMS
   * revalida tudo.
   *
   * ── O QUE ELA CUSTARIA NO DIA 10 ──────────────────────────────────────────────────────────
   *
   * Cinquenta motoristas num estande, cada um com um MOPP "vencido em 1990" no cadastro. Ninguém
   * conferindo data de curso durante o evento, e o erro só aparecendo na gerenciadora depois.
   *
   * ── VENCER HOJE AINDA VALE ────────────────────────────────────────────────────────────────
   *
   * A comparação é ESTRITAMENTE menor: um curso que vence hoje está válido hoje. Recusar por isso
   * mandaria embora quem está em dia por uma questão de horas.
   *
   * Datas ISO (`YYYY-MM-DD`) comparam bem como TEXTO, e é de propósito: nada de `new Date()` num
   * esquema puro, que traria o fuso do servidor para dentro de uma regra sobre o dia do motorista.
   */
  .refine((v) => v.possuiMopp === "nao" || !venceuAntesDeHoje(v.validadeMopp), {
    message: "A validade do MOPP já passou. Confira a data no certificado.",
    path: ["validadeMopp"],
  })
  .refine((v) => v.possuiToxicologico === "nao" || !venceuAntesDeHoje(v.validadeToxicologico), {
    message: "A validade do exame toxicológico já passou. Confira a data no exame.",
    path: ["validadeToxicologico"],
  });

/**
 * A data já passou, no dia de SÃO PAULO?
 *
 * O fuso é o da empresa e não o do servidor: às 22h de Brasília o servidor em UTC já está no dia
 * seguinte, e um certificado que vence hoje seria recusado por causa disso — justamente à noite,
 * que é quando a operação mais roda.
 *
 * Ausente devolve `false`: quem não mandou data cai na regra de cima, que é a que reclama disso.
 * Duas mensagens sobre o mesmo campo vazio confundiriam quem está preenchendo no celular.
 */
function venceuAntesDeHoje(iso: string | undefined): boolean {
  if (!iso) return false;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return iso < hoje;
}

export type PreCadastroInput = z.infer<typeof preCadastroSchema>;

/**
 * Os tipos de arquivo aceitos, e o motivo de serem só três.
 *
 * É o que um celular produz ao fotografar um documento, mais o PDF que quem já tem o arquivo manda.
 * Qualquer outra coisa é recusada — a rota não adivinha formato, e um arquivo que ela não sabe ler
 * viraria uma foto que ninguém consegue abrir na conferência.
 */
export const PRE_CADASTRO_TIPOS_ACEITOS = ["image/jpeg", "image/png", "application/pdf"] as const;
