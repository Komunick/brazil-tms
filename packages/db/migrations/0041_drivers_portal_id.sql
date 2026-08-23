-- O id do motorista no portal do cliente (2026-08-23). Ver `schema/drivers.ts`.
--
-- A única chave que os dois cadastros compartilham. Sem ela o casamento é por NOME, que é frágil e
-- já custou motoristas que existiam e o sistema jurava não existirem.
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "portal_driver_id" text;--> statement-breakpoint
-- Um motorista do portal é UM motorista aqui. Parcial porque o nulo é o normal de quem nunca
-- apareceu no portal, e nulos não colidem entre si.
CREATE UNIQUE INDEX IF NOT EXISTS "drivers_portal_id_uq"
  ON "drivers" ("portal_driver_id") WHERE "portal_driver_id" IS NOT NULL;
