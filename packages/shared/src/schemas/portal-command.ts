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
    action: z.enum(["accept", "reject"]),
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
  })
  .refine((v) => v.action !== "reject" || v.reasonId != null, {
    message: "Escolha o motivo da recusa.",
    path: ["reasonId"],
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
});

export type PortalCommandResult = z.infer<typeof portalCommandResultSchema>;

/** O corpo com que o robô pergunta "tem ordem para mim?". Token no corpo, como nos outros robôs. */
export const portalCommandPullSchema = z.object({
  token: z.string().trim().min(1).optional(),
  limite: z.number().int().min(1).max(20).optional(),
});
