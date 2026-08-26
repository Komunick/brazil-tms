/*
 * O PREVISTO E O COMENTÁRIO — duas camadas por cima da viagem (2026-08-26, a pedido).
 *
 * ══ 1. O PREVISTO: quem VAI dirigir, antes de a ordem existir ═════════════════════════════════
 *
 * A programação se decide horas antes de a atribuição sair. Quem monta o dia já sabe que a LH das
 * 04h é do Marcelo com a THG3J43 — mas atribuir ali seria cedo demais: a ordem vai ao portal do
 * cliente e não volta. Hoje esse saber vive na planilha, ou na cabeça de uma pessoa só.
 *
 * ── POR QUE NÃO REUSAR `trip_assignments` ─────────────────────────────────────────────────────
 *
 * Ela existe e seria o encaixe óbvio. É exatamente por isso que não serve: em 25/08 a escala
 * interna foi TIRADA desta tela porque gravava aqui e não ia ao portal — a pessoa substituía o
 * motorista, ia conferir lá e não achava nada. Repor o mesmo dado na mesma tabela recriaria o
 * mesmo engano com outro nome.
 *
 * O previsto é honesto sobre o que é: uma INTENÇÃO, guardada num lugar que ninguém pode confundir
 * com uma ordem. Quando a atribuição de verdade chega, ele deixa de ser mostrado — não porque
 * alguém o apagou, mas porque o fato passou a existir e a intenção não interessa mais.
 *
 * ── UMA LINHA POR VIAGEM, e a chave primária é o `trip_id` ────────────────────────────────────
 *
 * Não há histórico de previsões: quem trocou de ideia trocou de ideia. Guardar as anteriores
 * criaria uma lista que ninguém lê e uma pergunta ("qual vale?") que não deveria existir.
 *
 * ── O CHECK: um previsto vazio é um previsto apagado ──────────────────────────────────────────
 *
 * Sem ele, limpar os dois campos deixaria uma linha que existe e não diz nada — e a tela mostraria
 * "previsto" apontando para o vazio. Quem limpa tudo está desmarcando; o caminho é apagar a linha.
 *
 * ── O MOTORISTA É O DO PORTAL, NÃO O NOSSO ────────────────────────────────────────────────────
 *
 * `portal_driver_id` como texto, a mesma chave que o diálogo de atribuição usa. É de propósito: o
 * previsto tem de PRÉ-PREENCHER aquele diálogo, e uma chave diferente obrigaria a traduzir entre
 * as duas — tradução por nome, que é frágil e já nos mordeu. Sem chave estrangeira porque o
 * cadastro do portal é espelho: um motorista pode sumir de lá sem avisar, e isso não é motivo para
 * recusar a gravação de uma programação que já foi decidida.
 */
CREATE TABLE IF NOT EXISTS "trip_previsto" (
  "trip_id" uuid PRIMARY KEY NOT NULL REFERENCES "trips"("id") ON DELETE CASCADE,
  "portal_driver_id" text,
  "placa" text,
  "definido_por_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "definido_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "trip_previsto" DROP CONSTRAINT IF EXISTS "trip_previsto_algo_ck";--> statement-breakpoint
ALTER TABLE "trip_previsto" ADD CONSTRAINT "trip_previsto_algo_ck" CHECK (
  nullif(btrim("portal_driver_id"), '') IS NOT NULL
  OR nullif(btrim("placa"), '') IS NOT NULL
);--> statement-breakpoint

/*
 * ══ 2. O COMENTÁRIO: o recado que fica na viagem ══════════════════════════════════════════════
 *
 * "Cliente pediu para adiantar", "motorista avisou que atrasa 1h", "carreta trocada na origem".
 * Hoje isso vive no WhatsApp, some no dia seguinte, e quem entra no turno seguinte não tem como
 * saber. O comentário mora na viagem e é de TODOS — quem abre a LH lê o que já foi dito.
 *
 * ── POR QUE NÃO É `trip_events` NEM `alerts` ──────────────────────────────────────────────────
 *
 * `trip_events` é a linha do tempo: o que ACONTECEU com a carga, com tipo fechado e carimbo de
 * quando. Um recado humano não é um evento da viagem, e enfiá-lo ali sujaria a única lista que
 * responde "o que houve com esta carga".
 *
 * `alerts` é o que o sistema DETECTA e alguém precisa resolver, com estado e ciência. Comentário
 * não tem estado nem resolução — é conversa, e conversa que pede "dar ciência" vira tarefa.
 *
 * ── APAGAR É MARCAR, NÃO REMOVER ──────────────────────────────────────────────────────────────
 *
 * Quem escreve erra e vai querer desfazer. Mas apagar de verdade abriria o buraco de sempre: uma
 * conversa onde alguém pode fazer sumir o que disse depois que outra pessoa agiu em cima. Marcado,
 * some da tela e continua no banco.
 *
 * ── O ÍNDICE É (trip_id, criado_em DESC) ──────────────────────────────────────────────────────
 *
 * As duas leituras são "os comentários desta viagem, do mais recente" e "quantos tem cada uma das
 * 400 linhas da programação". O par cobre as duas; por `trip_id` sozinho, a contagem da tela
 * ordenaria em memória 400 vezes por carga.
 */
CREATE TABLE IF NOT EXISTS "trip_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trip_id" uuid NOT NULL REFERENCES "trips"("id") ON DELETE CASCADE,
  "autor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "texto" text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "apagado_em" timestamp with time zone
);--> statement-breakpoint

ALTER TABLE "trip_comments" DROP CONSTRAINT IF EXISTS "trip_comments_texto_ck";--> statement-breakpoint
ALTER TABLE "trip_comments" ADD CONSTRAINT "trip_comments_texto_ck"
  CHECK (btrim("texto") <> '');--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "trip_comments_trip_idx"
  ON "trip_comments" ("trip_id", "criado_em" DESC);
