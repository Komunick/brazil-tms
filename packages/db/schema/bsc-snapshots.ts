import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * O BSC do cliente, espelhado (2026-08-17).
 *
 * A Shopee avalia a Brazil Transports num scorecard que vive num relatório do Looker Studio e fecha
 * uma vez por dia, às 4h. O TMS não CALCULA esse número — ele copia o que o cliente publicou, para
 * que a nota e a operação fiquem na mesma tela.
 *
 * Quatro decisões que a tabela carrega:
 *
 *   O CARIMBO É DO RELATÓRIO, não nosso. `capturedAt` é o "Atualizado em" que o próprio BSC mostra;
 *   `receivedAt` é quando chegou aqui. Guardar os dois é o que permite a tela dizer "BSC de 17/08
 *   04:11" em vez de fingir que o dado é de agora.
 *
 *   O PERÍODO FAZ PARTE DA IDENTIDADE. Os mesmos indicadores dão números completamente diferentes
 *   conforme o filtro — medido no próprio relatório: a nota geral foi de 72,8 para 62,75 só ao trocar
 *   o recorte. Uma linha sem período seria um número sem significado, então ele entra na chave.
 *
 *   UMA LINHA POR PUBLICAÇÃO E PERÍODO. O robô pode reenviar à vontade; o índice único garante que
 *   não duplica. E o histórico dia a dia sai de graça — algo que o BSC não oferece, porque lá só
 *   existe o número de hoje.
 *
 *   OS INDICADORES SÃO JSON. São ~20 rótulos definidos pela Shopee, que ela muda quando quer (o
 *   relatório já se chama "V3"). Uma coluna por indicador viraria migração a cada revisão do
 *   scorecard; um mapa rótulo → valor absorve a mudança e guarda até o indicador que ainda não
 *   existia.
 */
export const bscSnapshots = pgTable(
  "bsc_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Qual recorte o relatório estava mostrando: `day` | `week` | `month`. Texto e não enum porque o
     * conjunto é do cliente, não nosso — um recorte novo não deve exigir migração.
     */
    period: text("period").notNull(),
    /** O rótulo exato que o filtro exibia ("1–16 ago"), guardado como veio: é a prova do recorte. */
    periodLabel: text("period_label"),
    /** O "Atualizado em" do próprio relatório — a idade real do dado. */
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    /** Quando o TMS recebeu. Serve para diagnosticar o robô, nunca para exibir como frescor. */
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    /** A nota do velocímetro como o relatório mostra (ex.: 72,80 numa escala até 110). */
    score: numeric("score", { precision: 6, scale: 2 }),
    /** A faixa em que a nota caiu, no vocabulário do cliente: excelência / evolução / atenção / crítica. */
    zone: text("zone"),
    /** Rótulo → percentual, exatamente como o BSC publica. Indicador em branco lá fica ausente aqui. */
    indicators: jsonb("indicators").notNull().default({}),
  },
  (table) => [
    uniqueIndex("bsc_snapshots_period_captured_uq").on(table.period, table.capturedAt),
    index("bsc_snapshots_captured_at_idx").on(table.capturedAt),
  ],
);
