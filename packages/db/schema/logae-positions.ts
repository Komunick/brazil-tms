import { doublePrecision, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * ONDE A GERENCIADORA VÊ CADA CAMINHÃO, com coordenada (2026-08-26, a pedido).
 *
 * ── POR QUE NÃO SERVE O `fleet_positions` QUE JÁ TEMOS ────────────────────────────────────────
 *
 * Aquela tabela vem do robô que LÊ A GRADE do eTorre, e a posição chega como TEXTO: "0.64 km de
 * FILIAL COOPERCARGA JABOATÃO DOS GUARARAPES". Serve para uma pessoa ler e não serve para calcular
 * nada — não se ordena por distância a partir de uma frase.
 *
 * O `getPosicoes` da Integra devolve LATITUDE e LONGITUDE. Medido em 26/08 contra a produção: 91
 * veículos, 82 com posição de menos de uma hora, 89 com coordenada válida.
 *
 * São 91 e não as 936 placas do portal porque esta é a frota que a gerenciadora MONITORA — as que
 * têm rastreador cadastrado com ela. Que são, não por acaso, as que podem receber Pré-SM.
 *
 * ── UMA LINHA POR PLACA, SEM HISTÓRICO ────────────────────────────────────────────────────────
 *
 * A pergunta é "onde este caminhão está AGORA". Histórico de trajeto é outro problema, com outro
 * tamanho (91 veículos × uma posição por minuto = meio milhão de linhas por semana) e sem pedido.
 */
export const logaePositions = pgTable(
  "logae_positions",
  {
    placa: text("placa").primaryKey(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    cidade: text("cidade"),
    uf: text("uf"),
    /**
     * O MOTORISTA VEM COMO CPF, e isso é sorte.
     *
     * O campo `Motorista` do `getPosicoes` traz o CPF, não o nome — conferido nos 91 registros. É
     * bem melhor: CPF é chave estável e o nosso cadastro tem, então o casamento não depende de
     * nome, que é frágil e já custou caro nesta base.
     *
     * Sem chave estrangeira: o motorista pode não existir no nosso cadastro, e isso não é motivo
     * para recusar a posição de um caminhão que está rodando.
     */
    cpfMotorista: text("cpf_motorista"),
    /** `L` ligado, `D` desligado — como a gerenciadora manda. */
    ignicao: text("ignicao"),
    /** Referência textual, para quem quiser ler em vez de olhar o mapa. */
    referencia: text("referencia"),
    /**
     * Quando a TECNOLOGIA recebeu do veículo — não quando nós lemos.
     *
     * A diferença decide se a posição presta: um caminhão com o rastreador sem sinal continua
     * devolvendo a última posição conhecida, e sem esta coluna ela pareceria de agora. Nulo
     * acontece — dois dos 91 vieram sem data e sem coordenada.
     */
    posicaoEm: timestamp("posicao_em", { withTimezone: true }),
    /** Quando NÓS carregamos. É o que diz se o job está rodando. */
    carregadoEm: timestamp("carregado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * Por FRESCOR, e não por placa — a placa já é a chave primária.
     *
     * A pergunta da tela é sempre "quem tem posição recente": uma posição de março não ajuda
     * ninguém a decidir quem está perto da origem hoje, e é essa a linha que se filtra fora.
     */
    index("logae_positions_posicao_idx").on(table.posicaoEm.desc()),
  ],
);
