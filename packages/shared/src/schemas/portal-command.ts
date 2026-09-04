import { z } from "zod";
import { MOTIVOS_DE_RECUSA } from "../domain/portal-acceptance";

/**
 * O que a TELA manda quando alguém aperta Aceitar ou Rejeitar (2026-08-21).
 *
 * `reasonId` é um enum dos ids que o portal serve, não um inteiro livre: mandar um id que ele não
 * conhece só produziria uma recusa três saltos adiante — depois de a ordem nascer, o robô pegar e o
 * fornecedor responder —, e o usuário veria "falhou" sem saber por quê.
 */
export const portalActionBodySchema = z
  .object({
    action: z.enum(["accept", "reject", "assign"]),
    /**
     * A ATRIBUIÇÃO (2026-08-21). `driverId` é o id do motorista NO PORTAL, não o do TMS.
     *
     * As regras — quantas placas, qual das duas rotas do portal, o que é placa válida — vivem em
     * `domain/portal-assignment.ts`, sob teste. Aqui só se descreve a forma.
     */
    driverId: z.number().int().positive().nullish(),
    secondDriverId: z.number().int().positive().nullish(),
    plates: z.array(z.string().trim().min(1).max(16)).max(2).optional(),
    reasonId: z
      .union(
        MOTIVOS_DE_RECUSA.map((m) => z.literal(m.id)) as unknown as [
          z.ZodLiteral<number>,
          z.ZodLiteral<number>,
          ...z.ZodLiteral<number>[],
        ],
      )
      .nullish(),
    /** Observação livre de quem decidiu. Vai junto para o portal e fica no registro daqui. */
    remark: z.string().trim().max(500).nullish(),
    /**
     * POR QUE ESTÁ TROCANDO QUEM JÁ ESTAVA ESCALADO (2026-09-04, a pedido).
     *
     * Obrigatório só na TROCA — a primeira atribuição do dia não pede nada, porque é o trabalho
     * normal e um campo obrigatório em centenas de gestos por dia vira "asdf" digitado por reflexo.
     *
     * Texto livre por decisão do usuário. Ele NÃO vai para o portal: é registro nosso, e vai para a
     * linha do tempo da viagem, que é onde alguém procura "por que trocaram este motorista?".
     *
     * Quem recusa é o banco, dentro da transação que trava a viagem — ver `enfileirarOrdemDoPortal`.
     * A tela pede antes, mas tela não é garantia: quem tem a página aberta desde antes da regra
     * continuaria mandando sem motivo.
     */
    motivoDaTroca: z.string().trim().min(3).max(500).nullish(),
    /**
     * DE ONDE A DECISÃO SAIU (2026-09-01, fatia 030).
     *
     * NÃO vai para o portal — ele não tem este campo. Vai para a auditoria, para que a revisão
     * depois distinga a decisão tomada no calor do leilão, pelo cartão de spot, da tomada na tela
     * da viagem com a lista inteira à vista.
     *
     * Opcional, e ausente vale `tela_da_viagem`: é o único lugar de onde se decidia antes, e um
     * campo obrigatório aqui quebraria a tela que já existe sem ganhar nada.
     */
    origem: z.enum(["oferta_spot", "tela_da_viagem"]).nullish(),
    /**
     * O VÍNCULO DE CADA RECURSO, quando quem atribui o informa (2026-08-25, fatia 026).
     *
     * NÃO vai para o portal do cliente — ele não tem esse campo e não sabe o que fazer com ele.
     * Serve para gravar no NOSSO cadastro, porque é a gerenciadora Logae que exige a classificação
     * (frota própria, agregado ou terceiro) em toda solicitação de monitoramento.
     *
     * Tudo opcional: quem já foi classificado não é perguntado de novo, e uma atribuição de quem
     * não sabe responder continua funcionando — ela só não gera Pré-SM, e a viagem diz por quê.
     *
     * As placas vêm na MESMA ORDEM de `plates`: a primeira é o cavalo, as seguintes são carretas.
     * Amarrar por posição, e não por placa, evita que uma correção de digitação no meio do
     * formulário desassocie o vínculo do veículo a que ele se referia.
     */
    vinculos: z
      .object({
        placas: z
          .array(z.enum(["owned", "agregado", "terceiro"]).nullable())
          .max(3)
          .optional(),
        motorista: z.enum(["owned", "agregado", "terceiro"]).nullish(),
        segundoMotorista: z.enum(["owned", "agregado", "terceiro"]).nullish(),
      })
      .optional(),
  })
  .refine((v) => v.action !== "reject" || v.reasonId != null, {
    message: "Escolha o motivo da recusa.",
    path: ["reasonId"],
  })
  .refine((v) => v.action !== "assign" || v.driverId != null, {
    message: "Escolha o motorista.",
    path: ["driverId"],
  })
  .refine((v) => v.action !== "assign" || (v.plates?.length ?? 0) > 0, {
    message: "Informe a placa.",
    path: ["plates"],
  });

export type PortalActionBody = z.infer<typeof portalActionBodySchema>;

/**
 * O que o ROBÔ devolve depois de executar (2026-08-21).
 *
 * `ok` é a leitura que o robô faz do `retcode` do portal; `response` é a resposta CRUA. Os dois, e
 * não só o primeiro: o dia em que o portal passar a responder sucesso sem fazer nada, o único jeito
 * de descobrir é ter guardado o que ele disse.
 */
export const portalCommandResultSchema = z.object({
  token: z.string().trim().min(1).optional(),
  id: z.string().uuid(),
  ok: z.boolean(),
  response: z.unknown().optional(),
  error: z.string().trim().max(500).nullish(),
  /**
   * A RELEITURA DA VIAGEM, feita pelo robô logo depois da ação (2026-08-28).
   *
   * É o corpo cru do `/trip/detail` do portal. Opcional de propósito: o userscript se publica à
   * mão e vai ficar atrás do servidor por um tempo. Ausente, a ordem fecha como antes e a
   * auditoria diz que NÃO foi verificada — o que é diferente de dizer que foi.
   */
  confirmacao: z.unknown().optional(),
  /**
   * A ROTA DA AGÊNCIA que o robô usou na atribuição de revezamento (2026-09-04).
   *
   * Nula ou ausente na esmagadora maioria: só as viagens com ponto de troca no meio do caminho
   * exigem escolher rota, e só nelas o campo existe.
   *
   * Ela vem para ser AUDITADA. O robô resolve o `section_id` dentro da sessão do portal — o TMS não
   * tem como sabê-lo — e uma escolha que o robô faz sozinho, sem rastro, é uma escolha que ninguém
   * consegue revisar depois. Aqui ela fica ao lado de quem pediu a atribuição.
   */
  rotaDaAgencia: z.number().int().positive().nullish(),
});

export type PortalCommandResult = z.infer<typeof portalCommandResultSchema>;

/** O corpo com que o robô pergunta "tem ordem para mim?". Token no corpo, como nos outros robôs. */
export const portalCommandPullSchema = z.object({
  token: z.string().trim().min(1).optional(),
  limite: z.number().int().min(1).max(20).optional(),
});

/**
 * O PULSO DE UM ROBÔ QUE NEM SEMPRE ENTREGA (2026-08-29).
 *
 * Os ciclos de leitura provam que rodaram ao ENTREGAR uma página. O de spot não entrega nada
 * quando não há leilão — e quase nunca há. Ficava mudo por horas, e "sem oferta" era
 * indistinguível de "robô morto".
 *
 * `robot` é texto livre de propósito: a tela de status lê a tabela inteira, sem lista fixa, e um
 * robô novo aparece sozinho.
 */
export const robotPulseSchema = z.object({
  token: z.string().trim().min(1).optional(),
  robot: z.string().trim().min(1).max(40),
  /** De quanto em quanto tempo ele promete rodar. É contra isto que o sufoco é medido. */
  cicloMs: z.number().int().positive().optional(),
  /** Quanto esta volta levou. Maior que `cicloMs` é sufoco. */
  duracaoMs: z.number().int().nonnegative().optional(),
});

export type RobotPulse = z.infer<typeof robotPulseSchema>;
