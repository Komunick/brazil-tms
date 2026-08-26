import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * DE QUAL ESTAÇÃO NOSSA PARA QUAL CIDADE DELES (2026-08-25, fatia 027).
 *
 * O `setPreSM` pede o **código IBGE** da cidade de coleta e da de entrega. O nosso cadastro de
 * locais quase não tem cidade preenchida — medido: das 228 estações, **8 têm `city`** e 71 têm
 * `state`. Mas o NOME da estação carrega os dois:
 *
 *     SOC_MG_BETIM                    →  MG · BETIM
 *     LM HUB_TO_PALMAS                →  TO · PALMAS
 *     SOC_PE_JABOATÃO DOS GUARARAPES  →  PE · JABOATAO DOS GUARARAPES
 *
 * Esta tabela guarda o resultado desse casamento contra o cadastro de 5.571 cidades que o
 * `getCidades` devolve.
 *
 * ── `confirmado_em` NULO É O PONTO DO DESENHO ─────────────────────────────────────────────────
 *
 * A carga PROPÕE; uma pessoa CONFIRMA. Só linha confirmada vale para criar Pré-SM.
 *
 * Não é burocracia: o casamento por nome, quando erra, **erra apontando para OUTRA cidade**, não em
 * branco. Uma Pré-SM com a cidade errada é escolta contratada para um trajeto que o caminhão não
 * vai fazer, e ninguém percebe até o veículo estar na estrada.
 *
 * ── POR QUE `uf` E `cidade_nome` FICAM GUARDADOS ──────────────────────────────────────────────
 *
 * Não são derivados na hora de propósito: são a **prova** de como a proposta foi feita. Quando
 * alguém estranhar uma correspondência, a pergunta é "de onde saiu isso?", e a resposta precisa
 * estar na linha — não numa reexecução do normalizador, que pode ter mudado desde então.
 */
export const preSmCityLinks = pgTable(
  "pre_sm_city_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** O nome da estação NORMALIZADO — é por aqui que a criação da Pré-SM procura. */
    estacaoNorm: text("estacao_norm").notNull(),
    /** A UF extraída do nome da estação. Guardada como prova da proposta, não recalculada. */
    uf: text("uf").notNull(),
    /** A cidade extraída do nome da estação. Idem. */
    cidadeNome: text("cidade_nome").notNull(),
    /** O código IBGE no cadastro da gerenciadora. É o `CodIBGECidade` do `setPreSM`. */
    codIbge: integer("cod_ibge").notNull(),
    /**
     * Como ELA escreve a cidade — `"BETIM / MG"`.
     *
     * É o que a pessoa compara na tela para decidir se o casamento está certo. Sem isto, confirmar
     * seria aprovar um número.
     */
    descricao: text("descricao").notNull(),
    /** Nulo = proposto pela carga, ainda não conferido. Só linha confirmada vale. */
    confirmadoEm: timestamp("confirmado_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pre_sm_city_links_estacao_uk").on(table.estacaoNorm),
    index("pre_sm_city_links_confirmado_idx").on(table.confirmadoEm),
  ],
);
