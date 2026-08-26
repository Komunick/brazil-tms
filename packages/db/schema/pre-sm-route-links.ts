import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * DE QUAL ROTA NOSSA PARA QUAL ROTA DELES (2026-08-25, fatia 027).
 *
 * O `setPreSM` pede o **código da rota** no cadastro da gerenciadora — e só ele: `LocaisParada`,
 * `Polyline` e `PontosPassagem` são opcionais. A rota não é montada por nós.
 *
 * Medido em 25/08: ela tem **518 rotas** cadastradas; das nossas 134 em 90 dias, **53 existem lá** —
 * 52% das viagens. As outras 81 são trabalho de cadastro NA LOGAE, e esta tabela é o que torna essa
 * lista visível.
 *
 * ── VEIO DA FATIA 026, APONTANDO PARA OUTRA COISA ─────────────────────────────────────────────
 *
 * Chamava-se `pre_sm_route_models` e guardava `cod_modelo`, porque a 026 criava a Pré-SM a partir
 * de um modelo. A gerenciadora respondeu por escrito que tem de ser pelo `setPreSM`, e o
 * `setPreSMdeModelo` morreu junto com o modelo.
 *
 * A troca foi de forma, sem migração de dado: a tabela estava vazia em todo lugar e a migração
 * `0046` nunca chegou à produção.
 *
 * ── `confirmado_em` NULO É O PONTO DO DESENHO ─────────────────────────────────────────────────
 *
 * A carga PROPÕE; uma pessoa CONFIRMA. Só linha confirmada cria Pré-SM.
 *
 * Sem isso, um casamento errado viraria escolta contratada para a rota errada — o tipo de erro que
 * ninguém percebe até o veículo estar na estrada com monitoramento de outro trajeto. O normalizador
 * errou de verdade duas vezes no dia em que foi escrito.
 */
export const preSmRouteLinks = pgTable(
  "pre_sm_route_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Nome da estação de origem, NORMALIZADO — é assim que o casamento acontece. */
    origemNorm: text("origem_norm").notNull(),
    destinoNorm: text("destino_norm").notNull(),
    /** O código da rota na gerenciadora. É o `Rota.CodRota` do `setPreSM`. */
    codRota: integer("cod_rota").notNull(),
    /**
     * Como ELA chama esta rota, no original.
     *
     * O `getRotas` devolve algo como `SHPX LOGISTICA LTDA. - SIMOES FILHO/BA/BRASIL ATE ... -
     * ARACAJU/SE/BRASIL`. É isso que a pessoa compara com a origem e o destino da nossa rota para
     * decidir se o casamento está certo — sem a descrição, conferir seria aprovar um número.
     */
    descricao: text("descricao").notNull(),
    /** Nulo = proposto pela carga, ainda não conferido. Só linha confirmada vale. */
    confirmadoEm: timestamp("confirmado_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pre_sm_route_links_rota_uk").on(table.origemNorm, table.destinoNorm),
    index("pre_sm_route_links_confirmado_idx").on(table.confirmadoEm),
  ],
);
