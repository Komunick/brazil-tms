import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { trips } from "./trips";

/**
 * A PRÉ-SM DA VIAGEM — o vínculo entre uma viagem nossa e a pré-solicitação na gerenciadora Logae
 * (2026-08-25, fatia 026).
 *
 * Depois que a atribuição chega ao portal do cliente, alguém abria o sistema da Logae e criava a
 * solicitação de monitoramento à mão, redigitando motorista, placas e horário que já estavam no TMS.
 * Esta tabela é o que permite o sistema fazer isso sozinho — e, principalmente, o que permite
 * DIZER quando não fez e por quê.
 *
 * ── VÁRIAS LINHAS POR VIAGEM, UMA VIVA POR VEZ ────────────────────────────────────────────────
 *
 * Uma viagem acumula linhas: a que foi cancelada, a que foi recusada, e a que valeu. Nova tentativa
 * **INSERE**; nunca atualiza uma linha morta. São duas razões, e nenhuma é estética.
 *
 * A constituição (princípio III) manda história operacional ser imutável. Um `update` sobre a linha
 * cancelada apagaria o registro de que houve uma Pré-SM antes, quem cancelou e por quê — exatamente
 * o rastro que alguém vai procurar no dia em que a gerenciadora cobrar por uma solicitação de que
 * ninguém se lembra.
 *
 * E o índice único abaixo **só funciona com `insert`**: num `update` a linha muda de estado sem
 * passar pela verificação de unicidade, e a garantia de "no máximo uma viva" evapora sem erro
 * nenhum aparecer.
 *
 * O que É atualização na mesma linha: as transições dela própria (`pendente` → `criada`, etc.).
 *
 * ── LER O ESTADO É LER A LINHA VIVA ───────────────────────────────────────────────────────────
 *
 * Não existe "a" Pré-SM da viagem no singular. Existe a viva (pendente ou criada) e, quando não há
 * viva, a mais recente — que conta o que aconteceu da última vez.
 */

/**
 * `sem_dados` é separado de `recusada` de propósito.
 *
 * Um é problema NOSSO (faltou CPF, modelo ou vínculo) e se resolve no nosso cadastro; o outro é
 * resposta DELA e se resolve com ela. Juntar os dois num "falhou" mandaria a pessoa procurar no
 * lugar errado metade das vezes.
 */
export const preSmStatus = pgEnum("pre_sm_status", [
  "pendente",
  "criada",
  "recusada",
  "sem_dados",
  "cancelada",
]);

export const tripPreSm = pgTable(
  "trip_pre_sm",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id),
    status: preSmStatus("status").notNull().default("pendente"),
    /** O código devolvido pela gerenciadora. Nulo até ela responder — é por ele que se consulta,
     *  altera ou cancela depois, e sem guardá-lo a Pré-SM vira órfã do nosso lado. */
    codigo: text("codigo"),
    /** Qual modelo de rota foi usado. Guardado para a conferência: duas viagens da mesma rota que
     *  usaram modelos diferentes é sinal de que a correspondência mudou no meio. */
    codModelo: integer("cod_modelo"),
    /** Por que não deu. Quando é recusa, é a mensagem DELA, sem tradução nossa (FR-014). */
    motivo: text("motivo"),
    /**
     * O corpo que foi (ou teria sido) mandado, SEM credencial.
     *
     * Sem isto, uma recusa da gerenciadora é indepurável — não há como saber o que ela recebeu. E
     * é o que torna o modo desligado útil: com o interruptor em `false` o job grava aqui o que
     * mandaria, e dá para conferir a feature inteira sem criar nada no sistema deles.
     */
    payloadEnviado: jsonb("payload_enviado"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    tentativas: integer("tentativas").notNull().default(0),
  },
  (table) => [
    /**
     * NO MÁXIMO UMA VIVA POR VIAGEM — a garantia que vale dinheiro.
     *
     * A gerenciadora cobra por solicitação: duas Pré-SM para a mesma viagem é escolta contratada em
     * dobro. Um `select` antes do `insert` deixaria janela entre os dois, e o gatilho é uma fila
     * que pode reprocessar.
     *
     * PARCIAL de propósito. Cobrindo todos os estados, uma Pré-SM cancelada travaria a viagem para
     * sempre — e cancelar é justamente o que se faz quando ela nasceu errada. Recusada e cancelada
     * não impedem uma nova tentativa; pendente e criada impedem.
     */
    uniqueIndex("trip_pre_sm_viva_uk")
      .on(table.tripId)
      .where(sql`${table.status} in ('pendente', 'criada')`),
    index("trip_pre_sm_trip_idx").on(table.tripId),
    index("trip_pre_sm_status_idx").on(table.status),
  ],
);
