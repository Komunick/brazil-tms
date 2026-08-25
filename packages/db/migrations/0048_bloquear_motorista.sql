/*
 * BLOQUEAR UM MOTORISTA — a decisão de tirar alguém de circulação (2026-08-25, a pedido).
 *
 * ── POR QUE CAMPO PRÓPRIO, E NÃO `status = 'blocked'` ─────────────────────────────────────────
 *
 * Porque `blocked` JÁ SIGNIFICA outra coisa, e há oito motoristas assim em produção hoje: é o que
 * a carga do cadastro do portal escreve quando o CLIENTE desativou ou suspendeu a pessoa
 * (`Deactivated`, `Suspended`, `Terminated` — ver `seed/portal-fleet.ts`).
 *
 * Misturar os dois teria um efeito concreto e ruim: esses oito apareceriam na aba de bloqueados
 * como se tivessem sido bloqueados aqui, e "desbloquear" poria de volta na estrada exatamente quem
 * o cliente tirou de circulação. São decisões de donos diferentes e precisam de campos diferentes.
 *
 * Um campo próprio também sobrevive ao `status` mudar por qualquer outro motivo — desbloquear não
 * precisa adivinhar qual era o estado anterior, porque nunca o tocou.
 *
 * ── O MOTIVO É OBRIGATÓRIO, E O BANCO É QUEM GARANTE ──────────────────────────────────────────
 *
 * Decisão do usuário. Um bloqueio sem motivo vira, semanas depois, um nome que ninguém sabe por que
 * está parado — e aí ou alguém desbloqueia no escuro, ou o motorista fica parado para sempre.
 *
 * O CHECK amarra os três campos como um conjunto: ou está tudo preenchido, ou está tudo nulo. Sem
 * ele, um caminho de código que esquecesse o motivo gravaria um bloqueio mudo, e o defeito só
 * apareceria quando alguém fosse ler.
 */
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "blocked_by_user_id" uuid REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "blocked_reason" text;--> statement-breakpoint

ALTER TABLE "drivers" DROP CONSTRAINT IF EXISTS "drivers_blocked_ck";--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_blocked_ck" CHECK (
  ("drivers"."blocked_at" IS NULL
     AND "drivers"."blocked_by_user_id" IS NULL
     AND "drivers"."blocked_reason" IS NULL)
  OR ("drivers"."blocked_at" IS NOT NULL
     AND "drivers"."blocked_by_user_id" IS NOT NULL
     AND btrim(coalesce("drivers"."blocked_reason", '')) <> '')
);--> statement-breakpoint

/*
 * Índice PARCIAL: só as linhas bloqueadas.
 *
 * A aba de bloqueados é a única leitura que filtra por isto, e ela é o caso raro — 1.427 motoristas
 * ativos contra um punhado de bloqueados. Um índice sobre a coluna inteira gastaria espaço e
 * escrita para indexar 1.400 nulos que ninguém procura.
 */
CREATE INDEX IF NOT EXISTS "drivers_blocked_idx" ON "drivers" ("blocked_at") WHERE "blocked_at" IS NOT NULL;
