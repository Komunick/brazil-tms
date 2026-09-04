-- O CTE NA PROGRAMAÇÃO — a terceira marcação da linha (2026-09-04, a pedido).
--
-- `trip_programacao` já guardava duas decisões por viagem: o STATUS do trabalho sobre ela e o SM
-- (emitida ou não). O CTE é a terceira, e da mesma natureza: alguém olhou e afirmou.
--
-- ── POR QUE AQUI, E NÃO NUMA TABELA NOVA ─────────────────────────────────────────────────────
--
-- É o mesmo sujeito (a viagem), a mesma vida (o dia de trabalho) e o mesmo gesto (marcar na linha).
-- Uma tabela só para o CTE teria a mesma chave, o mesmo ciclo de limpeza e o mesmo dono — e faria
-- toda leitura da programação ganhar mais um join para trazer um booleano.
--
-- ── TRÊS ESTADOS, E O NULO É UM DELES ────────────────────────────────────────────────────────
--
-- `null` = ninguém olhou ainda. `false` = alguém olhou e disse que NÃO foi emitido — é uma
-- afirmação, não ausência. `true` = emitido. Sem o nulo, toda viagem nasceria dizendo "não emitido"
-- e a tela não teria como distinguir o que falta conferir do que foi conferido e está pendente.
--
-- Aditiva e sem valor padrão: as 858 linhas existentes continuam como estão, com o CTE em branco.
ALTER TABLE "trip_programacao" ADD COLUMN IF NOT EXISTS "cte" boolean;--> statement-breakpoint

-- Quem marcou e quando — as mesmas duas colunas que o SM já tem, pela mesma razão: a marcação é uma
-- afirmação de alguém, e daqui a um mês "quem disse que o CTE saiu?" é a pergunta que se faz.
ALTER TABLE "trip_programacao" ADD COLUMN IF NOT EXISTS "cte_por_user_id" uuid REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "trip_programacao" ADD COLUMN IF NOT EXISTS "cte_em" timestamptz;--> statement-breakpoint

-- ── O CHECK DE "LINHA VAZIA" PRECISA CONHECER O CTE ──────────────────────────────────────────
--
-- `trip_programacao_algo_ck` existe para que uma linha sem nenhuma informação não sobreviva: quem
-- limpa tudo está desmarcando, e o caminho para isso é a linha sair.
--
-- Sem acrescentar o CTE aqui, marcar SÓ o CTE numa viagem que não tem mais nada seria RECUSADO pelo
-- banco — e o sintoma na tela seria um V que não gruda, sem explicação nenhuma.
ALTER TABLE "trip_programacao" DROP CONSTRAINT IF EXISTS "trip_programacao_algo_ck";--> statement-breakpoint
ALTER TABLE "trip_programacao" ADD CONSTRAINT "trip_programacao_algo_ck" CHECK (
  nullif(btrim("portal_driver_id"), '') IS NOT NULL
  OR nullif(btrim("placa"), '') IS NOT NULL
  OR "status" IS NOT NULL
  OR "sm" IS NOT NULL
  OR "cte" IS NOT NULL
);--> statement-breakpoint

COMMENT ON COLUMN "trip_programacao"."cte" IS
  'Conhecimento de transporte emitido? null = ninguem olhou; false = alguem afirmou que nao; true = emitido.';
