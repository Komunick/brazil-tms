import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * DE QUAL ROTA NOSSA PARA QUAL MODELO DELES (2026-08-25, fatia 026).
 *
 * A gerenciadora Logae já tem 89 modelos de Pré-SM cadastrados, e eles são as nossas rotas —
 * `JABOATÃO X RECIFE OLINDA`, `PALMAS X GOIANIA (AEROPORTO)`, `LOUVEIRA X CAMPINAS`. Medido em
 * 25/08: cobrem 81 das nossas 138 rotas, ou 84% das viagens. Esta tabela é a ponte.
 *
 * ── POR QUE TABELA, E NÃO CASAMENTO EM TEMPO DE EXECUÇÃO ──────────────────────────────────────
 *
 * O casamento por nome precisa tolerar acento, o que está entre parênteses, sigla colada a número e
 * zero à esquerda. Não é hipótese: sem a última tolerância, 4 rotas e 233 viagens/mês caíam como
 * "sem modelo" — e o normalizador errou de verdade nesta mesma sessão.
 *
 * Uma regra dessas rodando a cada criação é uma regra que ninguém revisa. Guardada como linha, a
 * correspondência pode ser CONFERIDA por uma pessoa antes de valer, e corrigida no dia em que o
 * portal mudar a grafia de uma estação.
 *
 * ── `confirmado_em` NULO É O PONTO DO DESENHO ─────────────────────────────────────────────────
 *
 * A carga PROPÕE; uma pessoa CONFIRMA. Só linha confirmada cria Pré-SM.
 *
 * Sem isso, um casamento errado do normalizador viraria escolta contratada para a rota errada — o
 * tipo de erro que ninguém percebe até o veículo estar na estrada com monitoramento de outro
 * trajeto.
 */
export const preSmRouteModels = pgTable(
  "pre_sm_route_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Nome da estação de origem, NORMALIZADO — é assim que o casamento acontece. */
    origemNorm: text("origem_norm").notNull(),
    destinoNorm: text("destino_norm").notNull(),
    /** O código do modelo na gerenciadora. É o `CodModelo` do `setPreSMdeModelo`. */
    codModelo: integer("cod_modelo").notNull(),
    /**
     * Como ELA chama esta rota, no original.
     *
     * Guardado para quem for conferir reconhecer o que está aprovando: `JABOATAO X RECIFE OLINDA`
     * normalizado não se lê tão bem quanto `JABOATÃO X RECIFE OLINDA`, e a conferência é o passo em
     * que o erro precisa ser visível.
     */
    descricao: text("descricao").notNull(),
    /** Nulo = proposto pela carga, ainda não conferido. Só linha confirmada vale. */
    confirmadoEm: timestamp("confirmado_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pre_sm_route_models_rota_uk").on(table.origemNorm, table.destinoNorm),
    index("pre_sm_route_models_confirmado_idx").on(table.confirmadoEm),
  ],
);
