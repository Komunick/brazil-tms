/*
 * AS DUAS PONTES DE CADASTRO DA ABA GR (2026-08-25, fatia 027).
 *
 * A gerenciadora Logae respondeu por escrito que a Pré-SM tem de ser criada pelo `setPreSM`, e não
 * pelo `setPreSMdeModelo` que a fatia 026 escolheu. O `setPreSM` não pede um modelo de rota: pede o
 * **código da rota** no cadastro dela, e o **código IBGE** das cidades de coleta e entrega.
 *
 * Daí as duas pontes: rota → `CodRota`, e estação → cidade IBGE.
 *
 * ── POR QUE A TABELA DE ROTA MUDA DE FORMA EM VEZ DE GANHAR COLUNA ────────────────────────────
 *
 * `pre_sm_route_models` guardava `cod_modelo`. As duas tabelas da 026 estão **vazias em todo
 * lugar** — conferido no dev em 25/08 — e a migração `0046` **nunca chegou à produção**. Sem dado a
 * preservar, a forma limpa custa o mesmo que a suja.
 *
 * Acrescentar `cod_rota` e deixar `cod_modelo` nulo deixaria uma coluna que ninguém preenche e que
 * o próximo leitor vai tentar entender. Coluna morta é dívida que não avisa.
 *
 * O nome da tabela vira `pre_sm_route_links`, para casar com a irmã e não mentir sobre o conteúdo.
 *
 * ── E POR QUE DUAS TABELAS IRMÃS, E NÃO UMA GENÉRICA ──────────────────────────────────────────
 *
 * O princípio I da constituição manda esperar o terceiro caso antes de generalizar. São dois. Uma
 * "tabela de correspondências" com coluna de tipo economizaria dez linhas e custaria um `where` em
 * toda consulta e uma tela que precisa saber o que está mostrando.
 */

-- ── 1. A ponte de rota muda de forma ─────────────────────────────────────────────────────────
ALTER TABLE "pre_sm_route_models" RENAME TO "pre_sm_route_links";--> statement-breakpoint
ALTER TABLE "pre_sm_route_links" RENAME COLUMN "cod_modelo" TO "cod_rota";--> statement-breakpoint
ALTER INDEX "pre_sm_route_models_rota_uk" RENAME TO "pre_sm_route_links_rota_uk";--> statement-breakpoint
ALTER INDEX "pre_sm_route_models_confirmado_idx" RENAME TO "pre_sm_route_links_confirmado_idx";--> statement-breakpoint

-- ── 2. A ponte de cidade nasce ───────────────────────────────────────────────────────────────
/*
 * `uf` e `cidade_nome` NÃO são derivados na hora, de propósito: são a PROVA de como a proposta foi
 * feita. Quando alguém estranhar uma correspondência, a pergunta é "de onde saiu isso?", e a
 * resposta precisa estar na linha — não numa reexecução do normalizador, que pode ter mudado.
 *
 * `descricao` é como ELA escreve (`"BETIM / MG"`). É o que a pessoa compara na tela: o casamento
 * por nome, quando erra, erra apontando para OUTRA cidade, não em branco. Sem a descrição,
 * confirmar seria aprovar um número.
 */
CREATE TABLE IF NOT EXISTS "pre_sm_city_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "estacao_norm" text NOT NULL,
  "uf" text NOT NULL,
  "cidade_nome" text NOT NULL,
  "cod_ibge" integer NOT NULL,
  "descricao" text NOT NULL,
  "confirmado_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Uma estação tem UMA cidade. É a chave por onde a criação da Pré-SM procura.
CREATE UNIQUE INDEX IF NOT EXISTS "pre_sm_city_links_estacao_uk"
  ON "pre_sm_city_links" ("estacao_norm");--> statement-breakpoint

-- A tela lista as não confirmadas primeiro: elas são o trabalho pendente.
CREATE INDEX IF NOT EXISTS "pre_sm_city_links_confirmado_idx"
  ON "pre_sm_city_links" ("confirmado_em");
