import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { trips } from "./trips";
import { users } from "./users";

/**
 * O PREVISTO — quem VAI dirigir, antes de a ordem existir (2026-08-26, a pedido).
 *
 * A programação do dia se decide horas antes de a atribuição sair. Quem monta o dia já sabe que a
 * LH das 04h é do Marcelo com a THG3J43 — mas atribuir naquele momento seria cedo demais: a ordem
 * vai ao portal do cliente e não volta atrás. Esse saber vive hoje na planilha, ou na cabeça de uma
 * pessoa só, e some quando o turno troca.
 *
 * ── NÃO É `trip_assignments`, E ISSO É DELIBERADO ─────────────────────────────────────────────
 *
 * Aquela tabela existe e seria o encaixe óbvio. É exatamente por isso que não serve: em 25/08 a
 * escala interna foi RETIRADA da Minha Programação porque gravava ali e não ia ao portal — a
 * pessoa trocava o motorista, ia conferir no portal e não achava nada. Repor o mesmo dado na mesma
 * tabela recriaria o mesmo engano com outro nome.
 *
 * O previsto é honesto sobre o que é: uma INTENÇÃO. Quando a atribuição de verdade chega, ele para
 * de ser mostrado — não porque alguém o apagou, mas porque o fato passou a existir.
 *
 * ── UMA LINHA POR VIAGEM ──────────────────────────────────────────────────────────────────────
 *
 * `trip_id` é a chave primária: não há histórico de previsões, porque quem trocou de ideia trocou
 * de ideia. Guardar as anteriores criaria uma lista que ninguém lê e uma pergunta ("qual vale?")
 * que não deveria existir.
 */
export const tripPrevisto = pgTable(
  "trip_previsto",
  {
    tripId: uuid("trip_id")
      .primaryKey()
      .references(() => trips.id, { onDelete: "cascade" }),
    /**
     * O MOTORISTA É O DO PORTAL, e a chave é texto SEM referência.
     *
     * A mesma chave que o diálogo de atribuição usa, de propósito: o previsto tem de PRÉ-PREENCHER
     * aquele diálogo, e uma chave diferente obrigaria a traduzir entre as duas — tradução por nome,
     * que é frágil e já nos mordeu mais de uma vez.
     *
     * Sem chave estrangeira porque o cadastro do portal é ESPELHO: um motorista pode sumir de lá
     * numa recarga, e isso não é motivo para recusar a gravação de uma programação já decidida.
     */
    portalDriverId: text("portal_driver_id"),
    /** A placa como se escreve — cavalo, ou cavalo e carreta separados por vírgula. */
    placa: text("placa"),
    definidoPorUserId: uuid("definido_por_user_id")
      .notNull()
      .references(() => users.id),
    definidoEm: timestamp("definido_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * UM PREVISTO VAZIO É UM PREVISTO APAGADO.
     *
     * Sem esta trava, limpar os dois campos deixaria uma linha que existe e não diz nada — e a tela
     * mostraria "previsto" apontando para o vazio. Quem limpa tudo está desmarcando, e o caminho
     * para isso é apagar a linha.
     */
    check(
      "trip_previsto_algo_ck",
      sql`nullif(btrim(${table.portalDriverId}), '') IS NOT NULL OR nullif(btrim(${table.placa}), '') IS NOT NULL`,
    ),
  ],
);
