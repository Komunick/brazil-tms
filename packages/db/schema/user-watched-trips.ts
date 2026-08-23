import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { trips } from "./trips";
import { users } from "./users";

/**
 * MINHA PROGRAMAÇÃO — as viagens que cada pessoa escolheu acompanhar (2026-08-23, a pedido).
 *
 * A Torre mostra as 4.500 viagens; a Expedição mostra a fila do dia. Faltava o recorte pessoal: as
 * cinco ou dez LHs que ESTA pessoa está acompanhando agora, com o telefone do motorista à mão.
 *
 * ── CHAVE COMPOSTA, SEM ID PRÓPRIO ─────────────────────────────────────────────────────────────
 *
 * A linha É o par (usuário, viagem): acompanhar duas vezes a mesma viagem não quer dizer nada, e um
 * id surrogate abriria a porta para duas linhas iguais que a tela teria de deduplicar depois.
 *
 * ── CASCATA NOS DOIS LADOS ─────────────────────────────────────────────────────────────────────
 *
 * Usuário removido não deixa rastro aqui, e viagem apagada também não. A varredura de retiradas
 * APAGA viagem do portal que sumiu (ver `portal-withdrawn.ts`) — sem a cascata, ela falharia com
 * violação de chave estrangeira e a limpeza inteira travaria por causa de uma lista pessoal.
 *
 * Isto é preferência de tela, não histórico: quando a viagem some, a linha some com ela e ninguém
 * precisa saber que um dia alguém a acompanhou.
 */
export const userWatchedTrips = pgTable(
  "user_watched_trips",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    /** Quando entrou na lista — a ordem em que a pessoa as juntou é a ordem que ela espera ver. */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tripId] })],
);
