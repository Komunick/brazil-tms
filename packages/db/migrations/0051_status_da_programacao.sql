/*
 * O STATUS DA PROGRAMAÇÃO — a coluna que a planilha tem e a tela não tinha (2026-08-26, a pedido).
 *
 * A "PROGRAMAÇÃO 2026" tem uma coluna STATUS com dez valores coloridos, escolhidos à mão: A ENVIAR,
 * ENVIADO, PROG OK, CANCELADA, INFRUTÍFERA, NO SHOW, FINALIZADA, CIENTE, EM ROTA, RETIDO PF.
 *
 * ── SÓ QUATRO, POR DECISÃO ────────────────────────────────────────────────────────────────────
 *
 * `A_ENVIAR`, `ENVIADO`, `PROG_OK` e `NO_SHOW`. Os outros seis o TMS já sabe sozinho — cancelada,
 * finalizada e em rota saem do status da viagem, que vem do portal e não depende de ninguém
 * lembrar de marcar. Trazer os dez recriaria a pergunta "qual dos dois vale?" em toda linha.
 *
 * O CHECK trava a lista. Não é preciosismo: este valor pinta a linha, e um `PROG 0K` com zero no
 * lugar do O viraria um quinto status que não pinta nada e que ninguém enxerga como erro.
 *
 * ── É COMPARTILHADO, AO CONTRÁRIO DA COR ──────────────────────────────────────────────────────
 *
 * A cor da linha mora em `user_watched_trips` e é de quem marcou — sinal particular. O status NÃO:
 * a planilha tem UMA coluna que todo mundo lê, e é justamente essa coluna que ele substitui. Se
 * cada pessoa visse um status diferente, o quadro deixaria de responder "esta LH já foi enviada?",
 * que é a única pergunta que ele existe para responder.
 *
 * ── POR QUE ELE ENTRA EM `trip_previsto` EM VEZ DE UMA TABELA NOVA ────────────────────────────
 *
 * Seria a TERCEIRA tabela com `trip_id` como chave primária e uma decisão da operação dentro
 * (`trip_previsto`, e agora esta). Elas respondem à mesma pergunta — "o que a operação decidiu
 * sobre esta viagem na programação" — e separá-las obrigaria toda leitura da tela a juntar duas
 * tabelas para montar uma linha.
 *
 * `trip_comments` fica de fora e continua sozinha, porque é UM PARA MUITOS: não cabe numa linha por
 * viagem, e forçá-la a caber seria o erro oposto.
 *
 * Por isso a tabela muda de nome: `trip_previsto` descrevia o único campo que ela tinha, e agora
 * seria mentira. `trip_programacao` diz o que ela é.
 */
ALTER TABLE "trip_previsto" RENAME TO "trip_programacao";--> statement-breakpoint
ALTER TABLE "trip_programacao" RENAME CONSTRAINT "trip_previsto_algo_ck" TO "trip_programacao_algo_ck";--> statement-breakpoint

ALTER TABLE "trip_programacao" ADD COLUMN IF NOT EXISTS "status" text;--> statement-breakpoint
ALTER TABLE "trip_programacao" ADD COLUMN IF NOT EXISTS "status_por_user_id" uuid REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "trip_programacao" ADD COLUMN IF NOT EXISTS "status_em" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "trip_programacao" DROP CONSTRAINT IF EXISTS "trip_programacao_status_ck";--> statement-breakpoint
ALTER TABLE "trip_programacao" ADD CONSTRAINT "trip_programacao_status_ck" CHECK (
  "status" IS NULL OR "status" IN ('A_ENVIAR', 'ENVIADO', 'PROG_OK', 'NO_SHOW')
);--> statement-breakpoint

/*
 * A TRAVA DE "LINHA VAZIA" PRECISA CRESCER JUNTO.
 *
 * Antes ela dizia: uma linha só existe se tiver motorista ou placa previstos. Agora o status também
 * é motivo para a linha existir — marcar ENVIADO sem prever ninguém é uso legítimo, e é o mais
 * comum: o portal já escalou, e o que falta registrar é o que a operação fez.
 *
 * Sem esta troca, gravar só o status seria recusado pelo banco, e a tela mostraria um erro que não
 * tem nada a ver com o que a pessoa fez.
 */
ALTER TABLE "trip_programacao" DROP CONSTRAINT IF EXISTS "trip_programacao_algo_ck";--> statement-breakpoint
ALTER TABLE "trip_programacao" ADD CONSTRAINT "trip_programacao_algo_ck" CHECK (
  nullif(btrim("portal_driver_id"), '') IS NOT NULL
  OR nullif(btrim("placa"), '') IS NOT NULL
  OR "status" IS NOT NULL
);--> statement-breakpoint

/*
 * `definido_por_user_id` era NOT NULL porque só havia previsto, e previsto tem dono.
 *
 * Agora uma linha pode nascer só com status — e aí quem tem dono é o status, não o previsto. Manter
 * o NOT NULL obrigaria a gravar um dono de previsto que não existe.
 */
ALTER TABLE "trip_programacao" ALTER COLUMN "definido_por_user_id" DROP NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "trip_programacao_status_idx"
  ON "trip_programacao" ("status") WHERE "status" IS NOT NULL;
