import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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
    /** `L` ligado, `D` desligado, `?` sem sinal — como a gerenciadora manda. */
    ignicao: text("ignicao"),
    /**
     * KM/H, e NULO NÃO SIGNIFICA "não sei" (2026-08-28).
     *
     * Medido em produção com 108 posições: 37 trouxeram velocidade, e NENHUMA com valor zero. O
     * campo não é "0 quando parado" — ele simplesmente não vem. Então a leitura correta é sempre
     * velocidade JUNTO da ignição:
     *
     *   ignição L + velocidade   -> rodando, e a quantos
     *   ignição L sem velocidade -> ligado e parado (marcha lenta, carga, fila)
     *   ignição D                -> desligado
     *
     * Interpretar nulo como "parado" sozinho erraria nos 2 sem sinal de ignição.
     */
    velocidade: integer("velocidade"),
    /**
     * `RA` rastreador, `LP` localizador — e a diferença muda a confiança na hora da posição.
     *
     * O rastreador reporta sozinho, de minuto em minuto; o localizador responde quando
     * perguntado. Uma posição de LP com uma hora é o normal do aparelho; a mesma hora num RA é
     * sinal de problema. Sem esta coluna, a tela trataria as duas como iguais.
     */
    tipoRastreador: text("tipo_rastreador"),
    /** KM desde a posição anterior. Zero com ignição ligada por muito tempo é parado com motor. */
    distUltPosicao: doublePrecision("dist_ult_posicao"),
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
