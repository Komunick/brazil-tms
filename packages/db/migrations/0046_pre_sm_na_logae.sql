-- A PRÉ-SM NA GERENCIADORA LOGAE (2026-08-25, fatia 026).
-- Ver `specs/026-pre-sm-logae/data-model.md` para o porquê de cada decisão.
--
-- ESCRITA À MÃO, e não pelo `drizzle-kit generate`. Os snapshots de 0025 a 0045 não existem neste
-- repositório, então o gerador compara contra o snapshot 0024 e "reinventa" tudo que veio depois —
-- recriando spot_offers, portal_commands, driver_records e mais uma dúzia de tabelas que já estão
-- em produção. Rodar aquilo destruiria o banco. Daqui em diante: migração à mão.

-- ── 1. O VÍNCULO GANHA DOIS VALORES ───────────────────────────────────────────────────────────
--
-- A Logae exige, em toda solicitação, dizer o que é cada veículo, carreta e motorista: frota
-- própria (F), agregado (A) ou terceiro (T). O TMS distinguia só "nosso" de "de fora".
--
-- `subcontracted` FICA, dormente: Postgres não remove valor de enum, e 1.246 veículos e 405
-- motoristas o carregam hoje. No código ele significa "ainda não classificado", nunca erro — não
-- houve mutirão de cadastro, a classificação acontece pelo uso.
ALTER TYPE "public"."ownership_type" ADD VALUE IF NOT EXISTS 'agregado';--> statement-breakpoint
ALTER TYPE "public"."ownership_type" ADD VALUE IF NOT EXISTS 'terceiro';--> statement-breakpoint

-- ── 2. OS TRÊS CHECKS, REESCRITOS ─────────────────────────────────────────────────────────────
--
-- SEM ISTO A FEATURE QUEBRA NO PRIMEIRO UPDATE, com a migração tendo passado sem erro.
--
-- A regra antiga enumerava: (subcontracted E tem transportadora) OU (owned E não tem). Uma linha
-- com `agregado` não satisfaz nenhum dos dois braços, e o banco a recusa.
--
-- A forma nova diz a mesma coisa sem listar: frota própria não tem transportadora, todo o resto
-- tem. Não precisa mudar de novo quando surgir um quarto valor.
--
-- Medido em 25/08 no PG 16.14: o ADD VALUE acima e estes CHECKs cabem na MESMA transação, porque
-- nenhum deles cita os valores recém-criados.
ALTER TABLE "vehicles" DROP CONSTRAINT IF EXISTS "vehicles_ownership_carrier_ck";--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_ownership_carrier_ck" CHECK (
  ("vehicles"."ownership_type" = 'owned'  AND "vehicles"."carrier_id" IS NULL)
  OR ("vehicles"."ownership_type" <> 'owned' AND "vehicles"."carrier_id" IS NOT NULL)
);--> statement-breakpoint

ALTER TABLE "trailers" DROP CONSTRAINT IF EXISTS "trailers_ownership_carrier_ck";--> statement-breakpoint
ALTER TABLE "trailers" ADD CONSTRAINT "trailers_ownership_carrier_ck" CHECK (
  ("trailers"."ownership_type" = 'owned'  AND "trailers"."carrier_id" IS NULL)
  OR ("trailers"."ownership_type" <> 'owned' AND "trailers"."carrier_id" IS NOT NULL)
);--> statement-breakpoint

ALTER TABLE "drivers" DROP CONSTRAINT IF EXISTS "drivers_ownership_carrier_ck";--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_ownership_carrier_ck" CHECK (
  ("drivers"."ownership_type" = 'owned'  AND "drivers"."carrier_id" IS NULL)
  OR ("drivers"."ownership_type" <> 'owned' AND "drivers"."carrier_id" IS NOT NULL)
);--> statement-breakpoint

-- ── 3. O ESTADO DA PRÉ-SM POR VIAGEM ──────────────────────────────────────────────────────────
--
-- `sem_dados` é separado de `recusada`: um é problema NOSSO (faltou CPF, modelo ou vínculo) e o
-- outro é resposta DELA. Juntar os dois num "falhou" mandaria a pessoa procurar no lugar errado.
DO $$ BEGIN
  CREATE TYPE "public"."pre_sm_status" AS ENUM ('pendente', 'criada', 'recusada', 'sem_dados', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "trip_pre_sm" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trip_id" uuid NOT NULL,
  "status" "pre_sm_status" DEFAULT 'pendente' NOT NULL,
  -- Nulo até a gerenciadora responder. Sem guardá-lo não há como consultar, alterar ou cancelar.
  "codigo" text,
  "cod_modelo" integer,
  -- Quando é recusa, é a mensagem DELA, sem tradução nossa.
  "motivo" text,
  -- O corpo que foi (ou TERIA sido) mandado, sem credencial. É o que torna o modo desligado útil:
  -- dá para conferir a feature inteira sem criar nada no sistema deles.
  "payload_enviado" jsonb,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "settled_at" timestamp with time zone,
  "tentativas" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint

ALTER TABLE "trip_pre_sm"
  ADD CONSTRAINT "trip_pre_sm_trip_id_fk"
  FOREIGN KEY ("trip_id") REFERENCES "trips"("id");--> statement-breakpoint

-- NO MÁXIMO UMA VIVA POR VIAGEM — a garantia que vale dinheiro: a gerenciadora COBRA por
-- solicitação, e duas Pré-SM para a mesma viagem é escolta contratada em dobro.
--
-- PARCIAL de propósito. Cobrindo todos os estados, uma Pré-SM cancelada travaria a viagem para
-- sempre — e cancelar é justamente o que se faz quando ela nasceu errada.
--
-- Só funciona com INSERT: nova tentativa insere linha nova, nunca ressuscita uma morta. Num UPDATE
-- a linha mudaria de estado sem passar por esta verificação, e a garantia evaporaria em silêncio.
CREATE UNIQUE INDEX IF NOT EXISTS "trip_pre_sm_viva_uk"
  ON "trip_pre_sm" ("trip_id") WHERE "status" IN ('pendente', 'criada');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trip_pre_sm_trip_idx" ON "trip_pre_sm" ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trip_pre_sm_status_idx" ON "trip_pre_sm" ("status");--> statement-breakpoint

-- ── 4. A PONTE ROTA → MODELO ──────────────────────────────────────────────────────────────────
--
-- `confirmado_em` nulo = proposto pela carga, ainda não conferido. Só linha CONFIRMADA cria Pré-SM.
-- Um casamento errado do normalizador viraria escolta contratada para a rota errada — e o
-- normalizador já errou de verdade (4 rotas e 233 viagens/mês caíam por um zero à esquerda).
CREATE TABLE IF NOT EXISTS "pre_sm_route_models" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "origem_norm" text NOT NULL,
  "destino_norm" text NOT NULL,
  "cod_modelo" integer NOT NULL,
  -- Como ELA chama a rota, no original — para quem conferir reconhecer o que está aprovando.
  "descricao" text NOT NULL,
  "confirmado_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "pre_sm_route_models_rota_uk"
  ON "pre_sm_route_models" ("origem_norm", "destino_norm");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pre_sm_route_models_confirmado_idx"
  ON "pre_sm_route_models" ("confirmado_em");
