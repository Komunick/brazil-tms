import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { trips } from "./trips";
import { users } from "./users";

/**
 * O COMENTÁRIO — o recado que fica na viagem (2026-08-26, a pedido).
 *
 * "Cliente pediu para adiantar", "motorista avisou que atrasa uma hora", "carreta trocada na
 * origem". Hoje isso vive no WhatsApp, some no dia seguinte, e quem entra no turno seguinte não tem
 * como saber. O comentário mora na viagem e é de TODOS: quem abre a LH lê o que já foi dito.
 *
 * ── POR QUE NÃO É `trip_events` NEM `alerts` ──────────────────────────────────────────────────
 *
 * `trip_events` é a linha do tempo — o que ACONTECEU com a carga, com tipo fechado e carimbo de
 * quando. Um recado humano não é um evento da viagem, e enfiá-lo ali sujaria a única lista que
 * responde "o que houve com esta carga".
 *
 * `alerts` é o que o sistema DETECTA e alguém precisa resolver, com estado e ciência. Comentário
 * não tem estado nem resolução — é conversa, e conversa que pede "dar ciência" vira tarefa.
 *
 * ── APAGAR É MARCAR, NÃO REMOVER ──────────────────────────────────────────────────────────────
 *
 * Quem escreve erra e vai querer desfazer. Mas apagar de verdade abriria o buraco de sempre: uma
 * conversa em que alguém pode fazer sumir o que disse depois que outra pessoa agiu em cima dele.
 * Marcado, some da tela e continua no banco.
 */
export const tripComments = pgTable(
  "trip_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    /**
     * Sem cascata no autor, ao contrário da viagem: um comentário sem dono seria pior que um
     * comentário de alguém que saiu da empresa. A conversa precisa continuar dizendo quem falou.
     */
    autorUserId: uuid("autor_user_id")
      .notNull()
      .references(() => users.id),
    texto: text("texto").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    /** Marcado, não removido: some da tela e continua no banco. */
    apagadoEm: timestamp("apagado_em", { withTimezone: true }),
  },
  (table) => [
    /**
     * O par `(trip_id, criado_em DESC)` cobre as DUAS leituras que existem: os comentários desta
     * viagem, do mais recente; e quantos tem cada uma das 400 linhas da programação. Por `trip_id`
     * sozinho, a contagem da tela ordenaria em memória 400 vezes a cada carga.
     */
    index("trip_comments_trip_idx").on(table.tripId, table.criadoEm.desc()),
    check("trip_comments_texto_ck", sql`btrim(${table.texto}) <> ''`),
  ],
);
