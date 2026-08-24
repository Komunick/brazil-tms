import { sql } from "drizzle-orm";
import { boolean, check, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
    /**
     * A COR QUE ESTA PESSOA PÔS NESTA LINHA (2026-08-24, a pedido).
     *
     * Texto e não enum: a planilha que isto substitui usa a paleta inteira do Google e ninguém
     * combinou o que cada cor significa — é sinal particular de quem marca. Um enum obrigaria a
     * decidir hoje uma lista que a operação ainda não tem, e a primeira cor que faltasse viraria
     * migração. A paleta de fato oferecida mora na tela; aqui só existe o limite de tamanho.
     *
     * `null` = sem marca, que é o normal da esmagadora maioria das linhas.
     */
    cor: text("cor"),
    /**
     * ESCONDIDA PARA ESTA PESSOA, e só para ela.
     *
     * O quadro mostra a programação inteira; quem não quer ver uma LH a esconde. Nasce `false`
     * porque o contrário — nascer escondido e a pessoa ir revelando — faria a tela abrir vazia no
     * primeiro uso e parecer quebrada.
     *
     * Não apaga nada: a viagem continua no quadro de todo mundo, e some só desta tela.
     */
    oculta: boolean("oculta").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.tripId] }),
    check("user_watched_trips_cor_ck", sql`${table.cor} IS NULL OR length(${table.cor}) <= 24`),
  ],
);
