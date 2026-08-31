-- A SM NA LINHA DA PROGRAMAÇÃO (2026-08-31, a pedido)
--
-- "A SM foi emitida?" — sim ou não, marcado à mão por quem opera a programação, ao lado do status.
--
-- ── POR QUE UMA COLUNA NOVA, E NÃO UM QUINTO VALOR DE `status` ────────────────────────────────
--
-- `status` responde "em que pé está o trabalho sobre esta viagem" (a enviar → enviado → prog OK, ou
-- no show). É uma ESCADA: os valores se excluem, e a linha está num degrau de cada vez.
--
-- A SM é outra pergunta, e ela convive com qualquer degrau: uma viagem pode estar "Enviado" e com SM
-- emitida, ou "Enviado" e sem. Enfiá-la no mesmo enum obrigaria a tela a escolher entre dizer o
-- status ou dizer a SM — e ela mostraria um dos dois, nunca os dois.
--
-- ── TRÊS ESTADOS, E O NULO É UM DELES ────────────────────────────────────────────────────────
--
-- `null` = ninguém disse nada, e é a esmagadora maioria das linhas. `true` = emitida. `false` = não
-- emitida, e essa é uma AFIRMAÇÃO: alguém olhou e disse que não. Um booleano com default `false`
-- apagaria essa diferença, e o quadro passaria a dizer "não emitida" para milhares de viagens que
-- ninguém olhou.
--
-- ── ADITIVA, como a 0060 e pelo mesmo motivo ─────────────────────────────────────────────────
--
-- O deploy migra ANTES do build, e durante o build (minutos) o app antigo ainda serve. Coluna nula
-- não incomoda quem não a conhece.
--
-- As aspas nos nomes seguem a convenção das migrações desta tabela — e não é só estilo: o teste
-- `programacao-e-comentario.test.ts` procura `"coluna"` com aspas para provar que schema e migração
-- concordam. Sem elas ele acusa como ausente uma coluna que existe.

ALTER TABLE "trip_programacao" ADD COLUMN IF NOT EXISTS "sm" boolean;--> statement-breakpoint
ALTER TABLE "trip_programacao" ADD COLUMN IF NOT EXISTS "sm_por_user_id" uuid REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "trip_programacao" ADD COLUMN IF NOT EXISTS "sm_em" timestamptz;--> statement-breakpoint

-- A TRAVA DA LINHA VAZIA precisa aceitar a SM como razão de existir.
--
-- Ela existe desde a 0051 para impedir uma linha que não diz nada — sem previsto, sem placa e sem
-- status. Agora uma linha pode existir só por causa da SM: alguém marca "SM Sim" numa viagem que não
-- tem previsto nem status, e essa linha é legítima.
--
-- Sem alargar o CHECK, essa marcação seria RECUSADA pelo banco — e o erro apareceria só na hora do
-- clique, em produção, sem nada no código apontando para cá. Simulado no dev antes de subir: uma
-- linha só com SM passa, e a linha vazia continua sendo recusada.
ALTER TABLE "trip_programacao" DROP CONSTRAINT "trip_programacao_algo_ck";--> statement-breakpoint
ALTER TABLE "trip_programacao" ADD CONSTRAINT "trip_programacao_algo_ck" CHECK (
  nullif(btrim("portal_driver_id"), '') IS NOT NULL
  OR nullif(btrim("placa"), '') IS NOT NULL
  OR "status" IS NOT NULL
  OR "sm" IS NOT NULL
);
