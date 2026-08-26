import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { StatusDaProgramacao } from "@brazil-tms/shared";
import { trips } from "./trips";
import { users } from "./users";

/**
 * O QUE A OPERAÇÃO DECIDIU SOBRE ESTA VIAGEM na programação (2026-08-26, a pedido).
 *
 * Duas decisões, uma linha por viagem:
 *
 *   O PREVISTO — quem VAI dirigir, antes de a ordem existir
 *   O STATUS   — em que pé está o trabalho sobre ela: a enviar, enviado, prog OK, no show
 *
 * ── POR QUE AS DUAS NA MESMA TABELA ───────────────────────────────────────────────────────────
 *
 * Porque respondem à mesma pergunta e vivem no mesmo gesto. Separadas, seriam duas tabelas com
 * `trip_id` como chave primária, e toda leitura da tela juntaria as duas para montar uma linha.
 *
 * `trip_comments` fica de fora e continua sozinha, porque é UM PARA MUITOS — não cabe numa linha
 * por viagem, e forçá-la a caber seria o erro oposto.
 *
 * A tabela nasceu como `trip_previsto` em 2026-08-26 e foi renomeada no mesmo dia, quando o status
 * chegou: o nome antigo descrevia o único campo que ela tinha, e passaria a mentir.
 *
 * ── O PREVISTO NÃO É `trip_assignments`, E ISSO É DELIBERADO ──────────────────────────────────
 *
 * Aquela tabela existe e seria o encaixe óbvio. É exatamente por isso que não serve: em 25/08 a
 * escala interna foi RETIRADA da Minha Programação porque gravava ali e não ia ao portal — a
 * pessoa trocava o motorista, ia conferir no portal e não achava nada. Repor o mesmo dado na mesma
 * tabela recriaria o mesmo engano com outro nome.
 *
 * O previsto é honesto sobre o que é: uma INTENÇÃO. Quando a atribuição de verdade chega, ele para
 * de ser mostrado — não porque alguém o apagou, mas porque o fato passou a existir.
 */

/**
 * OS QUATRO STATUS moram em `@brazil-tms/shared`, e não aqui.
 *
 * Porque a TELA precisa da mesma lista para desenhar os botões, e a tela não pode importar valor
 * deste pacote — importaria o cliente de Postgres junto. Reexportados para quem já lê o schema não
 * ter de saber disso.
 */
export { STATUS_DA_PROGRAMACAO, type StatusDaProgramacao } from "@brazil-tms/shared";

export const tripProgramacao = pgTable(
  "trip_programacao",
  {
    tripId: uuid("trip_id")
      .primaryKey()
      .references(() => trips.id, { onDelete: "cascade" }),
    /**
     * O MOTORISTA PREVISTO É O DO PORTAL, e a chave é texto SEM referência.
     *
     * A mesma chave que o diálogo de atribuição usa, de propósito: o previsto tem de PRÉ-PREENCHER
     * aquele formulário, e uma chave diferente obrigaria a traduzir entre os dois cadastros por
     * nome — o que é frágil e já mordeu mais de uma vez nesta base.
     *
     * Sem chave estrangeira porque o cadastro do portal é ESPELHO: um motorista pode sumir de lá
     * numa recarga, e isso não é motivo para recusar uma programação já decidida.
     */
    portalDriverId: text("portal_driver_id"),
    /** A placa como se escreve — cavalo, ou cavalo e carreta separados por vírgula. */
    placa: text("placa"),
    /**
     * Quem definiu o PREVISTO. Nulo quando a linha existe só por causa do status — e é o caso mais
     * comum: o portal já escalou alguém, e o que falta registrar é o que a operação fez.
     */
    definidoPorUserId: uuid("definido_por_user_id").references(() => users.id),
    definidoEm: timestamp("definido_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),

    /**
     * O STATUS É COMPARTILHADO, ao contrário da cor da linha.
     *
     * A cor mora em `user_watched_trips` e é de quem marcou — sinal particular. O status não: a
     * planilha tem UMA coluna que todo mundo lê, e é essa coluna que ele substitui. Se cada pessoa
     * visse um status diferente, o quadro deixaria de responder "esta LH já foi enviada?" — que é a
     * única pergunta que ele existe para responder.
     */
    status: text("status").$type<StatusDaProgramacao>(),
    statusPorUserId: uuid("status_por_user_id").references(() => users.id),
    statusEm: timestamp("status_em", { withTimezone: true }),
  },
  (table) => [
    /**
     * UMA LINHA VAZIA É UMA LINHA APAGADA.
     *
     * Sem esta trava, limpar tudo deixaria uma linha que existe e não diz nada — e a tela mostraria
     * o selo "Previsto" apontando para o vazio. Quem limpa tudo está desmarcando, e o caminho para
     * isso é a linha sair.
     */
    check(
      "trip_programacao_algo_ck",
      sql`nullif(btrim(${table.portalDriverId}), '') IS NOT NULL OR nullif(btrim(${table.placa}), '') IS NOT NULL OR ${table.status} IS NOT NULL`,
    ),
    /**
     * O CHECK trava a lista, e não é preciosismo: este valor PINTA a linha. Um `PROG 0K` com zero
     * no lugar do O viraria um quinto status que não pinta nada e que ninguém enxerga como erro.
     */
    check(
      "trip_programacao_status_ck",
      sql`${table.status} IS NULL OR ${table.status} IN ('A_ENVIAR', 'ENVIADO', 'PROG_OK', 'NO_SHOW')`,
    ),
    /** Parcial: a esmagadora maioria das viagens não tem status, e elas não precisam de índice. */
    index("trip_programacao_status_idx")
      .on(table.status)
      .where(sql`${table.status} IS NOT NULL`),
  ],
);
