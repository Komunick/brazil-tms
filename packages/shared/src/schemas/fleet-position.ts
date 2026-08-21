import { z } from "zod";

/**
 * O que o leitor do rastreador manda ao TMS (2026-08-20).
 *
 * O eTorre devolve 380 campos por veículo — cadastro do rastreador, apelidos de tela, flags de
 * módulos que a empresa não contratou, e uma boa metade sempre nula. O robô recorta os que o TMS usa
 * e manda só esses.
 *
 * Isso é uma diferença deliberada em relação ao robô do portal, que entrega o payload CRU. Lá o
 * volume é pequeno e o TMS precisa aprender o vocabulário do cliente; aqui mandar tudo seria
 * empurrar 380 colunas por veículo a cada cinco minutos para descartar 365 delas do outro lado. O
 * recorte não é regra de negócio — é a mesma lista de campos que a tela já mostra.
 *
 * OS NOMES ORIGINAIS FICAM NO ROBÔ, não aqui: `GRA_PLACA`, `POD_LAT`, `GRJ_DATAHORAPREVISAOENTREGA`.
 * Se o fornecedor renomear um campo, quem quebra é o robô — e ele avisa no console quando um campo
 * seca para a frota inteira. Este contrato fala a língua do TMS.
 */
export const fleetPositionSchema = z.object({
  /** Placa do cavalo. Normalizada no servidor; aqui só se exige que exista. */
  plate: z.string().trim().min(1, "Informe a placa.").max(16),
  trailerPlate: z.string().trim().max(16).nullish(),
  driverLabel: z.string().trim().max(160).nullish(),

  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  positionLabel: z.string().trim().max(300).nullish(),
  /**
   * Instantes chegam como o rastreador escreve — `"2026-08-19 21:10:12"`, sem fuso.
   *
   * A conversão mora no servidor, e é lá que está o comentário sobre o porquê: um horário sem fuso
   * convertido no navegador do robô dependeria do relógio de uma VM, que é a última coisa em que se
   * deve confiar para gravar dado que alimenta cálculo de atraso.
   */
  positionAt: z.string().trim().max(40).nullish(),
  ignition: z.string().trim().max(4).nullish(),

  tripStatus: z.string().trim().max(60).nullish(),
  originCity: z.string().trim().max(160).nullish(),
  destinationCity: z.string().trim().max(160).nullish(),
  tripStartedAt: z.string().trim().max(40).nullish(),
  etaAt: z.string().trim().max(40).nullish(),

  /**
   * O `-1` DO RASTREADOR É "não se aplica", não um percentual negativo.
   *
   * Onze veículos vieram assim no primeiro lote real, todos com `STATUS_VIAGEM = SEM VIAGEM`: é o
   * jeito de dizer que não há viagem cujo progresso medir. O piso em zero recusou o RETRATO INTEIRO
   * por causa deles — e derrubar a frota toda por um campo que não se aplica a caminhão parado é o
   * oposto do que essa validação deveria proteger.
   *
   * O contrato passa a aceitar, e a tradução para null mora na gravação, onde a decisão pertence:
   * aqui se transporta o que o fornecedor manda; quem interpreta é o servidor.
   */
  progressPercent: z.number().min(-1).max(1000).nullish(),
  kmTravelled: z.number().min(-1).nullish(),
  /** O rastreador manda como texto ("0"); o servidor arredonda para inteiro. */
  stoppedMinutes: z.union([z.number(), z.string()]).nullish(),

  /**
   * OS FARÓIS CABEM EM 24, e o 8 que estava aqui recusou o primeiro lote real.
   *
   * Dois deles são de uma letra (`S`/`N`), e o limite foi escrito pensando neles. O de movimento
   * passou depois a vir escrito por extenso — `MOVIMENTANDO` — porque o farol equivalente devolve
   * `MAI`/`MOV` e obrigaria a adivinhar a abreviação. A troca foi feita e o limite ficou para trás:
   * o robô leu 84 veículos, entregou, e o TMS recusou o lote inteiro por causa do campo mais bobo
   * do contrato.
   */
  offRoute: z.string().trim().max(24).nullish(),
  noPosition: z.string().trim().max(24).nullish(),
  stoppedFlag: z.string().trim().max(24).nullish(),
});

export type FleetPositionInput = z.infer<typeof fleetPositionSchema>;

/**
 * O corpo da rota. Token no CORPO pela mesma razão da oferta de spot: quem chama é um script rodando
 * na origem do fornecedor, e um cabeçalho `Authorization` obrigaria a um preflight que exigiria CORS
 * do outro lado.
 *
 * O LOTE É A FROTA INTEIRA de cada leitura, não um veículo por chamada. São ~98 registros a cada
 * cinco minutos; mandar um a um seriam 98 requisições para dizer a mesma coisa, e a gravação
 * perderia a única propriedade que interessa aqui — ou o retrato entra inteiro, ou não entra.
 */
export const fleetFeedBodySchema = z.object({
  token: z.string().trim().min(1).optional(),
  /**
   * O PULSO DO ROBÔ (2026-08-21): quanto o ciclo que acabou levou, e qual o intervalo configurado.
   *
   * Opcionais de propósito. Um robô que ainda não foi atualizado continua entregando normalmente —
   * exigir o campo transformaria uma melhoria de vigilância em quebra de alimentação, que é o
   * oposto do que ela serve.
   */
  cicloMs: z.number().int().min(0).max(86_400_000).optional(),
  duracaoMs: z.number().int().min(0).max(86_400_000).optional(),
  positions: z.array(fleetPositionSchema).min(1).max(500),
});

export type FleetFeedBody = z.infer<typeof fleetFeedBodySchema>;
