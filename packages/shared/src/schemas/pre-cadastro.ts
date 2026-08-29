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
  });

export type PreCadastroInput = z.infer<typeof preCadastroSchema>;

/**
 * Os tipos de arquivo aceitos, e o motivo de serem só três.
 *
 * É o que um celular produz ao fotografar um documento, mais o PDF que quem já tem o arquivo manda.
 * Qualquer outra coisa é recusada — a rota não adivinha formato, e um arquivo que ela não sabe ler
 * viraria uma foto que ninguém consegue abrir na conferência.
 */
export const PRE_CADASTRO_TIPOS_ACEITOS = ["image/jpeg", "image/png", "application/pdf"] as const;
