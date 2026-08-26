/*
 * DE ONDE VEIO A COORDENADA DA ESTAÇÃO (2026-08-26, a pedido).
 *
 * `locations.latitude` e `longitude` já existiam — e estavam vazias nas 459 estações. O que falta
 * não é a coluna, é a PROCEDÊNCIA: sem ela, ninguém sabe se um ponto foi deduzido pela máquina ou
 * conferido por alguém, e portanto ninguém sabe se pode confiar.
 *
 * ── AS DUAS PROCEDÊNCIAS ──────────────────────────────────────────────────────────────────────
 *
 *   `logae_rota`  deduzida do KML de uma rota da gerenciadora. Precisão de CIDADE: cai sobre uma
 *                 instalação logística real, mas não necessariamente sobre o nosso pátio. Das 523
 *                 rotas, só 8 nomeiam a estação; o resto é "empresa + cidade".
 *
 *   `manual`      alguém marcou no mapa. É a verdade, e a carga automática nunca a sobrescreve.
 *
 * A regra de não sobrescrever o manual é o ponto inteiro desta coluna. Sem ela, o job de minuto em
 * minuto desfaria toda correção humana, e o defeito apareceria como "a coordenada volta sozinha
 * para o lugar errado" — sintoma que não aponta para causa nenhuma.
 */
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "coordenada_origem" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "coordenada_em" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "locations" DROP CONSTRAINT IF EXISTS "locations_coordenada_origem_ck";--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_coordenada_origem_ck" CHECK (
  "coordenada_origem" IS NULL OR "coordenada_origem" IN ('logae_rota', 'manual')
);--> statement-breakpoint

/*
 * A FAIXA DO BRASIL, no banco.
 *
 * KML manda `lon,lat` — o inverso de como se fala. Trocar os dois põe o Brasil na Somália, e o mapa
 * mostra caminhões na África sem erro nenhum aparecer. O código já filtra; esta trava é a segunda
 * rede, para o caminho que alguém escrever depois e esquecer de filtrar.
 *
 * `IS NULL` continua valendo: a esmagadora maioria das estações não tem coordenada, e não ter é
 * legítimo.
 */
ALTER TABLE "locations" DROP CONSTRAINT IF EXISTS "locations_coordenada_faixa_ck";--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_coordenada_faixa_ck" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL)
  OR ("latitude" BETWEEN -34 AND 6 AND "longitude" BETWEEN -74 AND -34)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "locations_com_coordenada_idx"
  ON "locations" ("coordenada_origem") WHERE "latitude" IS NOT NULL;
