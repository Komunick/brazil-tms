/*
 * A PASSAGEM DE TURNO — a planilha do diário vira estrutura (2026-08-26, a pedido).
 *
 * O levantamento do que a planilha é está em `docs/PROPOSTA-PASSAGEM-DE-TURNO.md`, e a forma de
 * cada setor em `packages/shared/src/domain/passagem-de-turno.ts`. Aqui só o que o banco precisa
 * guardar.
 *
 * ── TRÊS TABELAS, E POR QUE NÃO DEZESSEIS ─────────────────────────────────────────────────────
 *
 * São 20 seções entre os cinco setores, com colunas diferentes em quase todas. Uma tabela por
 * seção seriam 20 migrações para descrever a mesma coisa — "uma ocorrência que alguém anotou" — e
 * toda seção nova pedida pela operação viraria outra migração. A regra dos ≥3 de
 * `docs/PRINCIPLES.md` aponta para o outro lado.
 *
 * O preço é real e está anotado: o banco NÃO valida o conteúdo do `jsonb`. Quem valida é
 * `problemasDoItem`, na rota antes de gravar. Um `CHECK` genérico aqui não conseguiria — ele teria
 * de conhecer as 20 seções, e aí seria o catálogo declarado duas vezes, em duas linguagens.
 */

/*
 * ── O SETOR DA PESSOA ─────────────────────────────────────────────────────────────────────────
 *
 * SETOR NÃO É CARGO, e é por isso que ele não entra no enum `app_role`.
 *
 * O papel diz o que a pessoa pode FAZER no TMS — atribuir, importar, cancelar — e alimenta a
 * matriz de `packages/shared/src/auth/permissions.ts`. O setor diz qual FAIXA da passagem de turno
 * ela responde. Um `dispatcher` pode estar em PROGRAMAÇÃO ou em SPOT; um `control_tower` em GR ou
 * em Monitoring. Somar as duas coisas num enum só multiplicaria os oito papéis por cinco e
 * quebraria a matriz inteira.
 *
 * NULO É O NORMAL, não uma pendência de cadastro: a maioria dos usuários não faz passagem de turno
 * e nunca vai ter setor. Quem não tem lê tudo e não edita nada — o que é exatamente o que se quer
 * para quem só acompanha.
 *
 * Uma pessoa tem UM setor (decidido em 26/08). Se um dia puder ter vários, isto vira tabela de
 * vínculo — e o caminho é aditivo, sem perder o que já está aqui.
 */
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "setor" text;--> statement-breakpoint

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_setor_ck";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_setor_ck" CHECK (
  "setor" IS NULL OR "setor" IN ('PROGRAMACAO', 'SPOT', 'EMISSAO', 'GR', 'MONITORING')
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "users_setor_idx" ON "users" ("setor") WHERE "setor" IS NOT NULL;--> statement-breakpoint

/*
 * ── O BLOCO: (data, turno, setor) ─────────────────────────────────────────────────────────────
 *
 * Cinco setores × dois turnos = dez blocos por dia. Na planilha o dia é uma aba criada à mão, e é
 * por isso que só existem oito dias lá. Aqui o bloco do dia NÃO se cria: a chave já existe, e quem
 * abre a página encontra o seu pronto para escrever.
 *
 * `data` é a data LOCAL de São Paulo do dia em que o turno COMEÇOU — `date`, não `timestamptz`,
 * porque é rótulo de calendário e não instante. O T2 vai das 19h às 7h e atravessa a meia-noite;
 * às 2h da manhã de quinta o plantonista está no bloco de QUARTA. Quem faz essa conta é `turnoDe`,
 * em hora de São Paulo — nunca UTC. Ver o teste, que é onde o defeito estaria.
 */
CREATE TABLE IF NOT EXISTS "passagem_de_turno" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "data" date NOT NULL,
  "turno" text NOT NULL,
  "setor" text NOT NULL,

  /*
   * Os dois nomes que a planilha pede em toda faixa. TEXTO, e não referência a `users`.
   *
   * Quem assina o turno pode não ter conta no TMS — na planilha aparecem primeiros nomes soltos
   * ("SANDERSON"). Uma chave estrangeira transformaria "escrever quem estava" em "cadastrar quem
   * estava", e o registro simplesmente deixaria de ser preenchido. Quem editou de verdade fica
   * gravado em `atualizado_por_user_id`, que é fato do sistema; isto aqui é o que a operação diz.
   */
  "assistente" text,
  "supervisor" text,

  /*
   * ── O FECHAMENTO ────────────────────────────────────────────────────────────────────────────
   *
   * Fechar é o gesto que dá sentido à seção "Ocorrências para o próximo turno": há uma entrega.
   * Depois de fechado o bloco é somente-leitura e entra na linha do tempo.
   *
   * É BOTÃO, com trava automática de segurança depois (decidido em 26/08). O botão registra quem
   * entregou — que é o que a planilha tenta fazer com assistente e supervisor. A trava existe
   * porque um turno esquecido em aberto por três dias aceitaria edição retroativa sem que nada
   * acusasse, e a linha do tempo passaria a mentir.
   *
   * `fechado_automaticamente` separa os dois casos na leitura: um bloco fechado pela trava não teve
   * ninguém para entregá-lo, e a tela deve dizer isso em vez de fingir que houve passagem.
   */
  "fechado_em" timestamp with time zone,
  "fechado_por_user_id" uuid REFERENCES "users"("id"),
  "fechado_automaticamente" boolean NOT NULL DEFAULT false,

  "criado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_por_user_id" uuid REFERENCES "users"("id"),

  CONSTRAINT "passagem_de_turno_turno_ck" CHECK ("turno" IN ('T1', 'T2')),
  CONSTRAINT "passagem_de_turno_setor_ck" CHECK (
    "setor" IN ('PROGRAMACAO', 'SPOT', 'EMISSAO', 'GR', 'MONITORING')
  ),

  /*
   * A CHAVE ÚNICA É O CORAÇÃO DISTO.
   *
   * Ela é o que permite ao bloco "já existir": a rota faz `insert ... on conflict do nothing` e
   * segue. Sem ela, dois operadores abrindo a mesma faixa no mesmo segundo criariam dois blocos, e
   * cada um escreveria no seu — dois diários do mesmo turno, e nenhum aviso.
   */
  CONSTRAINT "passagem_de_turno_unico" UNIQUE ("data", "turno", "setor"),

  /*
   * Fechado sem quando, ou quando sem fechado, seria estado impossível: a tela usa `fechado_em`
   * para decidir se trava a edição, e um `fechado_por_user_id` solto sugeriria uma entrega que não
   * houve.
   */
  CONSTRAINT "passagem_de_turno_fechamento_ck" CHECK (
    ("fechado_em" IS NULL AND "fechado_por_user_id" IS NULL)
    OR "fechado_em" IS NOT NULL
  )
);--> statement-breakpoint

/* A linha do tempo lê por data, do mais recente para o mais antigo. */
CREATE INDEX IF NOT EXISTS "passagem_de_turno_data_idx"
  ON "passagem_de_turno" ("data" DESC, "turno", "setor");--> statement-breakpoint

/* Os blocos ainda abertos — é a pergunta da trava automática, e são poucos. */
CREATE INDEX IF NOT EXISTS "passagem_de_turno_aberto_idx"
  ON "passagem_de_turno" ("data") WHERE "fechado_em" IS NULL;--> statement-breakpoint

/*
 * ── O ITEM: uma ocorrência anotada ────────────────────────────────────────────────────────────
 *
 * `secao` é a chave declarada em `SECOES_DO_SETOR` — sem chave estrangeira porque o catálogo é
 * código, não tabela. `dados` é o conteúdo, conferido contra a seção antes de gravar.
 *
 * `ordem` existe porque a planilha tem ordem e a operação a usa: o primeiro da lista é o mais
 * urgente. Sem ela a leitura sairia na ordem do banco, que não tem ordem nenhuma, e a lista
 * embaralharia sozinha entre um refresh e outro.
 */
CREATE TABLE IF NOT EXISTS "passagem_de_turno_item" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "bloco_id" uuid NOT NULL REFERENCES "passagem_de_turno"("id") ON DELETE CASCADE,
  "secao" text NOT NULL,
  "ordem" integer NOT NULL DEFAULT 0,
  "dados" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "criado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "criado_por_user_id" uuid REFERENCES "users"("id"),
  "atualizado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_por_user_id" uuid REFERENCES "users"("id"),

  /*
   * O único `CHECK` que o banco consegue fazer sobre o `jsonb`: que ele seja um OBJETO.
   *
   * Não valida os campos de dentro — isso é `problemasDoItem`. Mas impede o engano de forma que
   * quebraria toda leitura de uma vez: gravar um array ou uma string crua onde a tela espera pares
   * chave/valor. É barato e pega a classe inteira.
   */
  CONSTRAINT "passagem_de_turno_item_objeto_ck" CHECK (jsonb_typeof("dados") = 'object')
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "passagem_de_turno_item_bloco_idx"
  ON "passagem_de_turno_item" ("bloco_id", "secao", "ordem");--> statement-breakpoint

/*
 * ── O CONTADOR DO RESUMO DA OPERAÇÃO ──────────────────────────────────────────────────────────
 *
 * Só o que foi DIGITADO mora aqui. O que o TMS calcula — no show, sem atribuição, delay, cadastros
 * pendentes — não se grava: seria uma cópia envelhecendo ao lado do fato, e no dia em que os dois
 * divergissem ninguém saberia qual vale.
 *
 * A exceção é o override: quem está no turno pode saber de algo que o banco ainda não viu, e então
 * digita por cima. Nesse caso o digitado vale, e a tela mostra OS DOIS — o do sistema riscado ao
 * lado. Um resumo que discorda do banco em silêncio é pior que resumo nenhum.
 *
 * ── `valor` É TEXTO, E NÃO INTEIRO ────────────────────────────────────────────────────────────
 *
 * Contrariando o instinto, e por prova: na planilha de 25/08 o contador "Bloqueios" do GR está
 * preenchido com `-` e o "ON TIME" do Monitoring com `x`. São respostas legítimas da operação —
 * "não se aplica", "não medi" — e um `integer` as recusaria, obrigando a inventar zero. Zero é uma
 * afirmação diferente de traço, e a diferença importa em resumo de turno.
 */
CREATE TABLE IF NOT EXISTS "passagem_de_turno_contador" (
  "bloco_id" uuid NOT NULL REFERENCES "passagem_de_turno"("id") ON DELETE CASCADE,
  "chave" text NOT NULL,
  "valor" text NOT NULL,
  "atualizado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_por_user_id" uuid REFERENCES "users"("id"),
  PRIMARY KEY ("bloco_id", "chave")
);
