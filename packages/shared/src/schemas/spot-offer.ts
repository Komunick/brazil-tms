import { z } from "zod";

/**
 * O que o monitor de leilão manda ao TMS (2026-08-18).
 *
 * É o mesmo objeto que ele já monta para escrever no Telegram — de propósito. O TMS não recalcula
 * nada com estes valores; ele mostra na TV o que já foi conferido no celular. Pedir campos novos
 * significaria mexer na parte do monitor que está validada em produção, e ganhar duas versões da
 * mesma informação.
 */
export const spotOfferSchema = z.object({
  /** O id da viagem no portal — a chave de "já vi esta oferta" dos dois lados. */
  portalTripId: z.string().trim().min(1, "Informe o id da viagem no portal.").max(64),
  tripNumber: z.string().trim().max(64).optional(),
  /** "ORIGEM  ->  DESTINO". É o texto que a sala lê de longe, então é o único campo obrigatório. */
  route: z.string().trim().min(1, "Informe a rota.").max(300),
  vehicle: z.string().trim().max(120).optional(),
  price: z.string().trim().max(60).optional(),
  /** O STA da PRIMEIRA parada — a hora de comparecer na origem. Ver o comentário da coluna. */
  originArrival: z.string().trim().max(60).optional(),
  departure: z.string().trim().max(60).optional(),
  arrival: z.string().trim().max(60).optional(),
  operator: z.string().trim().max(120).optional(),
  createdAtPortal: z.string().trim().max(60).optional(),
});

export type SpotOfferInput = z.infer<typeof spotOfferSchema>;

/**
 * O corpo aceito pela rota.
 *
 * O token vai no CORPO, e não no cabeçalho `Authorization`, por uma razão de navegador: qualquer
 * cabeçalho fora do punhado padrão transforma o POST em requisição "não simples" e obriga o
 * navegador a um preflight `OPTIONS` — que o monitor, rodando na origem do portal do cliente, teria
 * de negociar por CORS antes de conseguir mandar qualquer coisa. Com o token no corpo e
 * `Content-Type: text/plain`, o aviso sai na primeira tentativa.
 *
 * A rota também aceita o cabeçalho, para `curl` e para o dia em que o chamador não for um navegador.
 */
export const spotOfferBodySchema = z.object({
  token: z.string().trim().min(1).optional(),
  offer: spotOfferSchema,
});

export type SpotOfferBody = z.infer<typeof spotOfferBodySchema>;
