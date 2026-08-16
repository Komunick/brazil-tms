-- Uma rota É o seu (cliente, origem, destino). Antes do índice, resolver qualquer duplicata viva
-- que já exista: mantém a MAIS ANTIGA (a que as regras de SLA/tarifas provavelmente já apontam) e
-- arquiva as demais. Sem isso, a criação do índice aborta o deploy num banco que tenha duplicatas
-- — e não há como inspecionar produção daqui.
UPDATE "lanes" l
SET "archived_at" = now(), "updated_at" = now()
WHERE l."archived_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "lanes" keep
    WHERE keep."archived_at" IS NULL
      AND keep."customer_id" = l."customer_id"
      AND keep."origin_location_id" = l."origin_location_id"
      AND keep."destination_location_id" = l."destination_location_id"
      AND (keep."created_at", keep."id") < (l."created_at", l."id")
  );
--> statement-breakpoint
CREATE UNIQUE INDEX "lanes_customer_route_uq" ON "lanes" USING btree ("customer_id","origin_location_id","destination_location_id") WHERE "lanes"."archived_at" is null;
