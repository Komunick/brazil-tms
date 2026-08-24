import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { drivers } from "./drivers";
import { trips } from "./trips";
import { users } from "./users";

/**
 * O QUE ACONTECEU COM ESTE MOTORISTA, escrito por quem viu (2026-08-24, a pedido).
 *
 * O TMS sabia MEDIR o motorista — entregas no prazo, nota, rotas que ele já fez — e não sabia
 * CONTAR nada sobre ele. Reclamação de cliente, atraso que teve explicação, elogio da estação,
 * advertência aplicada: tudo isso vivia no WhatsApp de quem escalava, e sumia junto com a conversa.
 *
 * Na hora de escolher quem mandar, o número diz "entrega 93% no prazo" e não diz "levou advertência
 * por sumir na semana passada". As duas coisas decidem, e só uma estava na tela.
 *
 * ── AS CATEGORIAS SÃO FIXAS, E FOI DECISÃO EXPLÍCITA ──────────────────────────────────────────
 *
 * `reclamacao`, `atraso`, `elogio`, `advertencia`. O usuário escolheu fixas em vez de texto livre
 * (2026-08-24), e a diferença é o que se pode perguntar depois: com categoria dá para contar
 * "quantas reclamações este motorista teve nos últimos 90 dias"; com texto livre, cada um escreve
 * "reclamação", "reclamacao" e "RECLAMAÇÃO", e a conta não fecha nunca.
 *
 * O preço é o caso estranho que não cabe em nenhuma das quatro. Ele cabe no TEXTO, que é obrigatório
 * — a categoria classifica, a frase explica, e nenhum registro entra sem explicação.
 *
 * CHECK e não enum do Postgres: acrescentar uma quinta categoria vira uma linha de migração em vez
 * de um `ALTER TYPE` que trava a tabela. A lista é da operação e vai crescer.
 *
 * ── A VIAGEM É OPCIONAL, E MORRE ANTES DO REGISTRO ────────────────────────────────────────────
 *
 * Quase toda ocorrência acontece EM uma viagem, e apontar para ela é o que permite abrir o caso
 * depois. Mas a viagem pode ser apagada — a varredura de retiradas do portal apaga viagem que sumiu
 * de lá —, e o registro tem de sobreviver a isso. Por isso `on delete set null`: perde-se o link,
 * nunca o fato. Um `cascade` aqui apagaria a advertência junto com a viagem, calado.
 *
 * ── NÃO SE APAGA, NÃO SE EDITA ────────────────────────────────────────────────────────────────
 *
 * Não há coluna de edição nem de exclusão de propósito: é registro de ocorrência, e registro que se
 * reescreve deixa de servir como registro. Quem errou acrescenta outro dizendo que errou — que é o
 * que um caderno de ocorrências sempre fez.
 */
export const driverRecords = pgTable(
  "driver_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    /** `reclamacao` · `atraso` · `elogio` · `advertencia` — ver o CHECK abaixo. */
    tipo: text("tipo").notNull(),
    /** O que houve, em texto. Obrigatório: categoria sem explicação não ajuda ninguém depois. */
    texto: text("texto").notNull(),
    /** A viagem em que aconteceu, quando aconteceu numa. Sobrevive à viagem ser apagada. */
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "set null" }),
    /** Quem registrou. Ocorrência sem autor é boato. */
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "driver_records_tipo_ck",
      sql`${table.tipo} IN ('reclamacao', 'atraso', 'elogio', 'advertencia')`,
    ),
    check("driver_records_texto_ck", sql`length(btrim(${table.texto})) BETWEEN 1 AND 2000`),
    // A leitura é sempre "os registros deste motorista, do mais novo para o mais velho".
    index("driver_records_driver_idx").on(table.driverId, table.createdAt.desc()),
  ],
);
