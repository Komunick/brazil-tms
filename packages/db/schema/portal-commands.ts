import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { trips } from "./trips";
import { users } from "./users";

/**
 * A PRIMEIRA VEZ QUE O TMS MANDA NO PORTAL, e não só escuta (2026-08-21).
 *
 * Até aqui os três robôs eram estritamente de leitura — o do portal traz no cabeçalho a regra
 * "SOMENTE LEITURA … se um dia precisar escrever, não é aqui". Este é o "um dia". A operação quer
 * aceitar e rejeitar viagem sem abrir o portal, e são 617 esperando decisão.
 *
 * ── POR QUE UMA TABELA, E NÃO UMA CHAMADA DIRETA ───────────────────────────────────────────────
 *
 * Quem está autenticado no portal é o NAVEGADOR DA VM, não o nosso servidor. Um POST saindo daqui
 * seria recusado por falta de sessão. Então o clique vira uma ORDEM gravada, e o robô — que já roda
 * dentro daquela sessão — a executa e devolve o resultado.
 *
 * Isso não é um contorno: é o que torna a coisa auditável. A ordem registra QUEM pediu, QUANDO, com
 * que motivo, o que o portal respondeu e quando. Um clique direto no portal não deixa nada disso —
 * é exatamente a cegueira que a operação tem hoje.
 *
 * ── UMA ORDEM ABERTA POR VIAGEM ────────────────────────────────────────────────────────────────
 *
 * O índice parcial garante que não existam duas ordens pendentes para a mesma viagem. Sem ele, dois
 * cliques apressados viram dois POSTs, e "aceitar duas vezes" é o tipo de erro que ninguém consegue
 * desfazer do nosso lado. Ordem terminada não bloqueia: rejeitar depois de uma tentativa que falhou
 * é caso real.
 *
 * ── O ESTADO É DO TMS, A VERDADE É DO PORTAL ───────────────────────────────────────────────────
 *
 * `done` diz que o portal respondeu sucesso. Quem CONFIRMA é o ciclo de leitura seguinte, quando a
 * viagem reaparece como `Accepted` — e é por isso que a tela mostra as duas coisas. Uma resposta de
 * sucesso que não se reflete na leitura é justamente o caso que precisa ser visto, não escondido.
 */
export const portalCommandAction = pgEnum("portal_command_action", [
  "accept",
  "reject",
  /**
   * ESCALAR MOTORISTA E PLACA (2026-08-21) — a segunda metade do fluxo.
   *
   * Chega depois do aceite, e no portal é literalmente a tela seguinte. Mora na MESMA fila porque é
   * a mesma natureza: uma decisão de gente que precisa sair daqui e chegar lá, com o mesmo registro
   * de quem pediu e a mesma prova de que o portal concordou.
   */
  "assign",
]);

export const portalCommandStatus = pgEnum("portal_command_status", [
  /** Gravada, esperando o robô pegar. */
  "pending",
  /** O robô pegou e está executando. Protege contra dois robôs na mesma ordem. */
  "sent",
  /** O portal respondeu sucesso. */
  "done",
  /** O portal recusou, ou a chamada não completou. `last_error` diz o quê. */
  "failed",
]);

export const portalCommands = pgTable(
  "portal_commands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id),
    /**
     * O id NUMÉRICO do portal, copiado no momento em que a ordem nasce.
     *
     * Copiado, e não lido da viagem na hora de executar, porque é o endereço do destinatário: se a
     * viagem for reimportada e o campo mudar, a ordem que já saiu tem de continuar dizendo para onde
     * ela foi. Endereço de carta enviada não se reescreve.
     */
    portalTripId: text("portal_trip_id").notNull(),
    /** O número da LH, para a tela e para o log falarem a língua da operação. */
    externalTripId: text("external_trip_id"),

    action: portalCommandAction("action").notNull(),
    /**
     * O motivo da recusa, no vocabulário do PORTAL (`reason_id`).
     *
     * O portal não deixa rejeitar sem motivo — o botão dele abre um diálogo antes de qualquer
     * chamada. São três opções hoje, servidas por ele; guardamos o id porque é o que ele aceita, e o
     * rótulo fica na tela, traduzido de uma lista nossa.
     */
    reasonId: integer("reason_id"),
    /** A observação livre que acompanha a recusa, quando quem decidiu quis explicar. */
    remark: text("remark"),

    /**
     * A ATRIBUIÇÃO, quando `action = assign`.
     *
     * `driver_id` é o id do motorista NO PORTAL, não o do TMS — a única chave que os dois lados
     * compartilham, e que o robô de leitura já traz desde agosto. `second_driver_id` é o que o portal
     * chama de `driver_pool`, e a presença dele MUDA A ROTA da chamada: ver `rotaDaAtribuicao`.
     *
     * As placas vão como TEXTO separado por vírgula, e não como coluna de array, porque é o que elas
     * são para nós: uma ou duas etiquetas que o portal valida. Guardar array aqui pediria um tipo
     * novo para ganhar nada — quem interpreta é quem monta o payload, e são duas.
     */
    driverId: integer("driver_id"),
    secondDriverId: integer("second_driver_id"),
    plates: text("plates"),
    /**
     * A PLACA QUE FICA SÓ NO TMS (2026-08-28, a pedido).
     *
     * O portal recusa quando o número de placas não bate com o tipo que a LH pede — `retcode
     * 131213004`. Mas a operação PRECISA registrar a carreta que seguiu junto de um truck.
     *
     * A regra: a primeira placa vai ao portal; o que passar do que ele comporta fica aqui, como
     * controle interno. Assim `plates` continua sendo exatamente o que foi ENVIADO — que é a
     * definição dela desde que nasceu e o que o robô lê — e nenhuma das duas colunas mente.
     *
     * Nula na imensa maioria das linhas: só a LH que levou placa a mais tem valor aqui.
     */
    platesInternas: text("plates_internas"),

    status: portalCommandStatus("status").notNull().default("pending"),
    /**
     * Quantas vezes o robô já tentou.
     *
     * Existe para PARAR, não para insistir: erro de negócio do portal ("já aceita", "expirou") se
     * repete igual em toda tentativa, e um robô teimoso transformaria uma recusa em enxurrada de
     * requisições ao fornecedor.
     */
    attempts: integer("attempts").notNull().default(0),
    /** O que o portal respondeu, cru. É o que sobra para diagnosticar quando alguém pergunta. */
    response: jsonb("response"),
    lastError: text("last_error"),

    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    /** Quando o robô pegou. Distância até agora é o atraso da fila. */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    /** Quando terminou, com sucesso ou não. */
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    index("portal_commands_status_idx").on(table.status, table.requestedAt),
    index("portal_commands_trip_idx").on(table.tripId),
  ],
);
