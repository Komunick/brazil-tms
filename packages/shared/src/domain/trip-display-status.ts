import { TRIP_STATUSES, type TripStatus } from "./trip-status";

/**
 * O que a OPERAÇÃO chama uma viagem que ainda não saiu (2026-08-18, a pedido).
 *
 * "Recebida" descrevia o TMS, não o trabalho. Dentro dela viviam duas filas que pedem coisas
 * completamente diferentes de pessoas diferentes, e ficavam indistinguíveis no quadro:
 *
 *   EM ANÁLISE — a proposta chegou e ninguém decidiu. O que falta é alguém ACEITAR ou REJEITAR.
 *   P/ATRIBUIR — o cliente já aceitou. O que falta é alguém pôr um MOTORISTA.
 *
 * Medido no dia em que isto foi pedido: 326 esperando atribuição contra 63 esperando decisão. Um
 * quadro que mostra 389 "Recebidas" esconde justamente a diferença que decide quem age.
 *
 * ── POR QUE É RÓTULO E NÃO STATUS NOVO ─────────────────────────────────────────────────────────
 *
 * A máquina de status do TMS continua com os mesmos 16 valores. Isto aqui não é um estado do
 * caminhão — é a leitura do que o CLIENTE respondeu, e ela já vive em `customer_fields`. Criar dois
 * status de verdade exigiria transições, enum no banco e histórico novo para descrever uma coisa
 * que o TMS não controla e que pode mudar quando a Shopee quiser.
 *
 * ── O EIXO É A ACEITAÇÃO, E ISSO FOI MEDIDO ────────────────────────────────────────────────────
 *
 * O pedido dizia "aceitação Accepted E status de viagem Assigned". Os dois exemplos dados junto
 * provaram outra coisa: `LT0Q8J02DVJ91` — o exemplo de "P/Atribuir" — está em `Assigning`, não em
 * `Assigned`. Pelo par descrito, ela não entraria. A regra por par pegaria 8 viagens; pelo eixo da
 * aceitação, pega as 326 que a operação de fato enxerga como fila de despacho.
 *
 * `Assigned` no portal quer dizer que JÁ TEM motorista lá — é o oposto de "para atribuir".
 */
export const TRIP_QUEUES = ["in_analysis", "to_assign", "awaiting_arrival"] as const;

export type TripQueue = (typeof TRIP_QUEUES)[number];

export type TripDisplayStatus = TripStatus | TripQueue;

/** A palavra do portal para "ninguém decidiu ainda". */
export const ACEITACAO_PENDENTE = "Pending";

/** A palavra do portal para "já tem motorista nesta viagem". */
export const PORTAL_ATRIBUIDA = "Assigned";

/**
 * O rótulo a mostrar para esta viagem. Só `received` se desdobra; todo o resto passa direto.
 *
 * A ORDEM DOS TESTES É A DO CICLO DE VIDA, e não é arbitrária: "já tem motorista" é o estado mais
 * avançado dos três e por isso vem primeiro. Uma viagem `Assigned` também está `Accepted`, então
 * testar a aceitação antes a jogaria em "p/atribuir" — mandando a operação fazer um trabalho que o
 * cliente já fez.
 *
 * Sem informação nenhuma — viagem digitada à mão, ou vinda de antes de o TMS ler esses eixos — cai
 * em `to_assign`. É a afirmação que se sustenta sem o portal: não há ninguém escalado aqui. As
 * outras duas seriam afirmações sobre o CLIENTE, e essas não dá para fazer sem ele ter falado.
 */
export function displayStatusOf(
  status: TripStatus,
  portalAcceptance: string | null | undefined,
  portalStatus?: string | null,
): TripDisplayStatus {
  /**
   * OS DOIS VOLTARAM A SER COISAS DIFERENTES (2026-08-31, a pedido) — e a fusão de 19/08 sai.
   *
   * Ela juntava `at_origin` e `awaiting_arrival` no mesmo rótulo, com o argumento de que "para quem
   * olha a tela, os dois querem dizer que a viagem está na origem". Medido em produção no dia em que
   * o usuário reclamou:
   *
   *   de verdade em `at_origin` .................. 8
   *   exibidas como se estivessem ................ 13
   *   dessas, com a COLETA AINDA NO FUTURO ....... 13   ← todas
   *
   * Nenhuma das treze tinha chegado à hora da coleta. A `LT0Q8V02F7RF1` mostrava origem às 20:30 e a
   * tela já dizia que ela estava lá. O rótulo tinha deixado de descrever e passado a afirmar algo
   * falso na MAIORIA dos casos, que é o pior desfecho possível para um rótulo de status.
   *
   * A diferença que a operação precisa é exatamente essa: "tem motorista escalado" não é "o caminhão
   * está no pátio". Uma decide se ainda falta despachar; a outra decide se dá para começar a
   * carregar.
   *
   * `at_origin` volta a se descrever sozinho — cai no `return status` abaixo.
   */
  if (status !== "received") return status;
  /**
   * ESCALADA NO PORTAL É "ATRIBUÍDA", uma linha só (2026-08-31, a pedido).
   *
   * Elas nasceram separadas porque `assigned` é a atribuição feita DENTRO do TMS e esta vem do
   * portal. A separação parecia útil — "dá para ver quais não passaram pela nossa tela" —, e o dado
   * mostrou que ela não cumpre isso:
   *
   *   13 exibidas como escaladas
   *      6  vieram de um clique NO TMS, pelo diálogo do portal
   *      7  escaladas direto lá dentro
   *
   * Quase metade veio do próprio TMS. O motivo é que `enfileirarOrdemDoPortal` NÃO mexe no
   * `current_status`: quem atribui pelo diálogo daqui deixa a viagem em `received`, igualzinho a
   * quem nunca abriu o TMS. O chip misturava os dois e não separava nada.
   *
   * Para quem opera, as duas dizem a mesma coisa: tem motorista nesta viagem. Uma palavra só.
   *
   * O QUE SE PERDE, e fica dito: deixa de dar para ver na lista quais viagens não têm atribuição
   * interna. Quem precisa disso de verdade é a Pré-SM, e a consulta dela já responde sozinha.
   */
  if (portalStatus === PORTAL_ATRIBUIDA) return "assigned";
  return portalAcceptance === ACEITACAO_PENDENTE ? "in_analysis" : "to_assign";
}

/**
 * A ordem do CICLO DE VIDA com as duas filas no lugar de "Recebida".
 *
 * "Em análise" vem antes de "P/Atribuir" porque é essa a sequência do trabalho: primeiro alguém
 * aceita, depois alguém escala. Quem lê o quadro espera encontrar as etapas na ordem em que
 * acontecem, e uma lista que reordena obriga a procurar de novo o que já se sabia onde era.
 */
export const TRIP_DISPLAY_ORDER: readonly TripDisplayStatus[] = TRIP_STATUSES.flatMap((s) =>
  s === "received"
    ? /**
       * `awaiting_arrival` sai da lista em 31/08: `displayStatusOf` deixou de devolvê-lo — o portal
       * escalado passou a exibir "Atribuída", junto do `assigned`. Deixá-lo aqui criaria um chip que
       * nunca conta nada, que foi exatamente o defeito que a retirada do `at_origin` causou em 19/08.
       *
       * A FILA continua existindo como parâmetro interno (`TRIP_QUEUES`), porque é ela que o filtro
       * usa para alcançar as viagens em `received` com motorista no portal.
       */
      (TRIP_QUEUES.filter((q) => q !== "awaiting_arrival") as TripDisplayStatus[])
    : // `at_origin` VOLTA À LISTA em 31/08: ele deixou de ser fundido e agora tem rótulo próprio
      // ("Na origem"), com 8 viagens de verdade nele no dia da medição. Tirá-lo esconderia o único
      // estado que afirma que o caminhão chegou.
      [s],
);

export function isTripQueue(status: TripDisplayStatus): status is TripQueue {
  return (TRIP_QUEUES as readonly string[]).includes(status);
}

/**
 * O recorte do quadro que corresponde EXATAMENTE a este rótulo.
 *
 * Existe para que a contagem e a lista nunca discordem: quem clica num número tem de cair na lista
 * que o produziu. As três filas compartilham o mesmo status real (`received`) e se separam por UM
 * parâmetro com três valores — não por dois booleanos, que permitiriam pedir combinações que não
 * existem ("em análise E já atribuída") e deixariam o quadro vazio sem explicar por quê.
 *
 * "NA ORIGEM" É A EXCEÇÃO, e ela custou um cartão que não filtrava nada (2026-08-19). Desde a fusão,
 * esse rótulo abrange DOIS status reais: a viagem que o portal escalou e ainda está em `received`, e
 * a que já chegou e está em `at_origin`. Mandar `status=received` junto com a fila cruzava os dois
 * filtros com E — e como as viagens do dia estavam todas em `at_origin`, a ficha anunciava 2 e a
 * lista abria vazia. A fila se basta: `queue=awaiting_arrival` já diz os dois status (ver o `or` em
 * `buildWhere`) — o que precisa sair do caminho é o status cru.
 */
export function boardFilterForDisplayStatus(status: TripDisplayStatus): {
  status: TripStatus[];
  queue?: TripQueue;
} {
  /**
   * "ATRIBUÍDA" É A EXCEÇÃO AGORA (31/08) — ela abrange dois status reais: `assigned`, que é a
   * atribuição feita no TMS, e `received` com motorista no portal.
   *
   * Manda a FILA e nenhum status cru: `buildWhere` reconhece `queue=awaiting_arrival` e monta o `or`
   * com os dois. Mandar `status=["assigned"]` junto cruzaria os dois filtros com E e a lista abriria
   * menor que o número que a anunciou — foi assim que o cartão de 19/08 anunciou 2 e abriu vazio.
   */
  if (status === "assigned") return { status: [], queue: "awaiting_arrival" };
  if (!isTripQueue(status)) return { status: [status] };
  return { status: ["received"], queue: status };
}

/** O mesmo recorte, escrito como trecho de URL. */
export function boardQueryForDisplayStatus(status: TripDisplayStatus): string {
  const recorte = boardFilterForDisplayStatus(status);
  return [
    ...recorte.status.map((s) => `status=${s}`),
    ...(recorte.queue ? [`queue=${recorte.queue}`] : []),
  ].join("&");
}
