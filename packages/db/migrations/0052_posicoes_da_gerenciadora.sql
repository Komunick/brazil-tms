/*
 * AS POSIÇÕES QUE A GERENCIADORA VÊ — com coordenada (2026-08-26, a pedido).
 *
 * ── POR QUE NÃO SERVE O `fleet_positions` QUE JÁ TEMOS ────────────────────────────────────────
 *
 * Aquela tabela vem do robô que LÊ A GRADE do eTorre, e a posição chega como TEXTO:
 * "0.64 km de FILIAL COOPERCARGA JABOATÃO DOS GUARARAPES". Serve para uma pessoa ler e não serve
 * para calcular nada — não dá para ordenar por distância a partir de uma frase.
 *
 * O método `getPosicoes` da Integra devolve LATITUDE e LONGITUDE. Medido em 26/08 contra a
 * produção: 91 veículos, **82 com posição de menos de uma hora**, 89 com coordenada válida. É a
 * frota que a gerenciadora monitora — não as 936 placas que o portal usa, e sim as que têm
 * rastreador cadastrado com ela, que são justamente as que podem receber Pré-SM.
 *
 * ── UMA LINHA POR PLACA, SEM HISTÓRICO ────────────────────────────────────────────────────────
 *
 * A pergunta é "onde este caminhão está AGORA", e é a única que esta tabela responde. Histórico de
 * trajeto é outro problema, com outro tamanho (91 veículos × uma posição por minuto = meio milhão
 * de linhas por semana) e sem pedido. Quando houver, que tenha tabela própria.
 *
 * ── O MOTORISTA VEM COMO CPF, E ISSO É SORTE ──────────────────────────────────────────────────
 *
 * O campo `Motorista` do `getPosicoes` traz o CPF, não o nome — conferido nos 91 registros. É bem
 * melhor: CPF é chave estável e o nosso cadastro tem, então o casamento não depende de nome, que é
 * frágil e já custou caro nesta base mais de uma vez.
 *
 * Guardado como texto e SEM chave estrangeira: o motorista pode não existir no nosso cadastro, e
 * isso não é motivo para recusar a posição de um caminhão que está rodando.
 */
CREATE TABLE IF NOT EXISTS "logae_positions" (
  "placa" text PRIMARY KEY NOT NULL,
  "latitude" double precision,
  "longitude" double precision,
  "cidade" text,
  "uf" text,
  /* CPF do motorista vinculado ao veículo na gerenciadora. Texto, sem FK — ver o topo. */
  "cpf_motorista" text,
  /* L = ligado, D = desligado. Como a gerenciadora manda. */
  "ignicao" text,
  /* Referência textual da posição, para quem quiser ler em vez de olhar o mapa. */
  "referencia" text,
  /*
   * Quando a TECNOLOGIA recebeu do veículo — não quando nós lemos.
   *
   * A diferença é o que decide se a posição presta: um caminhão parado com o rastreador sem sinal
   * continua devolvendo a última posição conhecida, e sem esta coluna ela pareceria de agora.
   * Nulo acontece: dois dos 91 vieram sem data e sem coordenada.
   */
  "posicao_em" timestamp with time zone,
  /* Quando NÓS carregamos. É o que diz se o job está rodando. */
  "carregado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

/*
 * O índice é por FRESCOR, e não por placa.
 *
 * A placa já é a chave primária. A pergunta da tela é sempre "quem tem posição recente" — uma
 * posição de março não ajuda ninguém a decidir quem está perto da origem hoje, e é justamente essa
 * a linha que precisa ser filtrada fora.
 */
CREATE INDEX IF NOT EXISTS "logae_positions_posicao_idx"
  ON "logae_positions" ("posicao_em" DESC);
