import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * QUANTO TEMPO CADA ROBÔ ESTÁ LEVANDO POR CICLO (2026-08-21).
 *
 * A tela de Status já respondia "o dado ainda está chegando?" — pelo carimbo da última entrega. Isso
 * pega a parada, mas só DEPOIS que ela acontece. Quando o navegador da VM começa a sufocar, o
 * sintoma vem antes e é outro: o ciclo configurado para 10 segundos passa a levar 45. O dado continua
 * chegando, só que velho, e ninguém vê — o carimbo está fresco, a tela diz "ok", e a operação decide
 * em cima de um retrato de um minuto atrás achando que é de agora.
 *
 * Esta tabela guarda os dois números lado a lado: o intervalo CONFIGURADO e a duração REAL do último
 * ciclo. A comparação entre eles é o aviso — "configurado 10s, levando 45s" diz que a máquina não
 * está dando conta, com folga para agir antes de o dado parar.
 *
 * ── UMA LINHA POR ROBÔ ─────────────────────────────────────────────────────────────────────────
 *
 * É o ÚLTIMO ciclo, sobrescrito a cada entrega. Guardar a série seria ~26 mil linhas por dia a 10
 * segundos, para responder "como estava anteontem às três da tarde?" — pergunta que ninguém faz
 * nesta tela. O que se quer saber é se ELE ESTÁ BEM AGORA.
 *
 * ── O ROBÔ SE IDENTIFICA, O TMS NÃO ADIVINHA ───────────────────────────────────────────────────
 *
 * `robot` é a chave que o próprio robô manda (`portal_plan`, `portal_execution`, `fleet`…). Um robô
 * novo aparece sozinho na tela, sem migração; um que pare de mandar continua com o último carimbo,
 * envelhecendo à vista.
 */
export const robotCycles = pgTable(
  "robot_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Quem está falando: `portal_plan`, `portal_in_progress`, `portal_execution`, `fleet`, `bsc`. */
    robot: text("robot").notNull(),
    /** O intervalo que o robô tem configurado, em ms. É a promessa dele. */
    intervalMs: integer("interval_ms"),
    /** Quanto o último ciclo levou de fato, em ms. É o cumprimento dela. */
    durationMs: integer("duration_ms"),
    /** Quando o TMS recebeu este pulso. */
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("robot_cycles_robot_uq").on(table.robot)],
);
