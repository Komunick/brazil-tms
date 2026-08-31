/**
 * A LEITURA DA CNH como trabalho de segundo plano (fatia 028, etapa 3).
 *
 * Enfileirado por EVENTO, quando um pré-cadastro chega pelo formulário público — e não por horário.
 * A leitura só faz sentido diante de um envio novo; uma varredura periódica reprocessaria os
 * mesmos documentos e gastaria dinheiro para chegar ao mesmo resultado.
 *
 * ── POR QUE NÃO NA ROTA ───────────────────────────────────────────────────────────────────────
 *
 * A rota pública responde em 0,74 s, com o motorista esperando no celular. A leitura leva segundos
 * e custa. Pendurá-la ali faria uma falha do provedor virar perda do cadastro — o motorista
 * perderia o envio por causa de algo que ele nem sabe que existe.
 */
export const CNH_JOBS = {
  cnhLer: "cnh.ler",
} as const;

export type CnhJobName = (typeof CNH_JOBS)[keyof typeof CNH_JOBS];

/**
 * SÓ O DOCUMENTO, e isso é deliberado.
 *
 * O pré-cadastro é descoberto pelo worker, a partir do envio que aponta para esta foto. A rota
 * pública nunca chega a saber qual pré-cadastro foi criado ou reaproveitado — `registrarPreCadastro`
 * devolve `void` justamente para que ela não possa vazar qual dos três casos de CPF ocorreu.
 *
 * Passar o id do pré-cadastro por aqui obrigaria a rota a recebê-lo, e o mesmo id voltando duas
 * vezes para o mesmo CPF já contaria que ele existia. A garantia é estrutural, e uma conveniência
 * de payload não vale desmontá-la.
 */
export interface CnhLerPayload {
  /** O documento da fatia 025 a ser lido — a foto da CNH daquele envio. */
  documentoId: string;
}

export interface CnhJobPayloads {
  "cnh.ler": CnhLerPayload;
}

/**
 * O ENVIO DO CADASTRO À GERENCIADORA (fatia 028, etapa 5).
 *
 * Processa um LOTE, não um cadastro: `getCidades` traz 5.571 municípios e é o mesmo catálogo para
 * todos. Um job por motorista buscaria a mesma resposta cinquenta vezes.
 */
export const MOTORISTA_JOBS = {
  motoristaCadastrar: "motorista.cadastrar",
  /**
   * O PEDIDO DE PESQUISA — a metade COBRADA (31/08, etapa 6).
   *
   * Fila própria, e nunca um lote: um job por clique, com o alvo no payload. O `motorista.cadastrar`
   * ao lado processa em lote porque é de graça; aqui um laço seria uma conta crescendo sozinha.
   *
   * E NÃO EXISTE VARREDURA que a enfileire. O único caminho até esta fila é um botão.
   */
  motoristaPesquisar: "motorista.pesquisar",
  /** O resultado da pesquisa. LEITURA, de graça — por isso pode ser agendado (etapa 7). */
  motoristaResultado: "motorista.resultado",
} as const;

export type MotoristaJobName = (typeof MOTORISTA_JOBS)[keyof typeof MOTORISTA_JOBS];

export interface MotoristaCadastrarPayload {
  /** Quantos por execução. Sem teto de custo — cadastrar não custa (D7) —, só de fôlego. */
  limite?: number;
  /**
   * UM SÓ, quando alguém apertou o botão numa linha. Ausente = todos os candidatos.
   *
   * Sem isto, um botão numa linha mandaria a fila inteira — e a pessoa que apertou em "João" veria
   * doze cadastros nascerem na gerenciadora. O id não afrouxa nada: a consulta continua exigindo
   * `arquivado_em IS NULL` e `enviado_em IS NULL`, então apontar para quem já foi não reenvia.
   */
  preRegistrationId?: string;
}

/**
 * UM MOTORISTA POR VEZ, com quem pediu e o que ele marcou.
 *
 * `solicitadoPor` viaja no payload em vez de o job descobrir sozinho: o job roda depois do clique,
 * e é o clique que tem dono. Sem isso, o registro diria "o worker pediu", que não responde nada
 * quando a fatura chegar.
 */
export interface MotoristaPesquisarPayload {
  preRegistrationId: string;
  solicitadoPor: string;
  vinculo: "F" | "A" | "T";
  /** As três que encarecem. Sem padrão aqui: o que a pessoa marcou é o que vai. */
  expressa: boolean;
  pesquisaPlus: boolean;
  biometrica: boolean;
}

export interface MotoristaJobPayloads {
  "motorista.cadastrar": MotoristaCadastrarPayload;
  "motorista.pesquisar": MotoristaPesquisarPayload;
  "motorista.resultado": Record<string, never>;
}
