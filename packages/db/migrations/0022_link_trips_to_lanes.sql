-- Backfill: as rotas que já rodam, registradas; as viagens existentes, ligadas a elas.
--
-- `trips.lane_id` existe desde a 003 e nunca foi escrito por ninguém — no tmsdev eram 871 viagens
-- sobre 110 pares origem→destino, todas sem rota. O custo não era só o filtro "Rota" vazio: os
-- relatórios de SLA e de exceções agrupam POR rota e jogavam tudo num único balde "—", e as regras
-- de SLA / tarifas / requisitos de documento por rota podiam ser cadastradas sem nunca casar.
--
-- Daqui para a frente `createTrip` resolve a rota no nascimento (find-or-create); esta migração faz
-- o mesmo para o que já está no banco. Só identidade de rota é preenchida: tarifa, distância e
-- tempo de trânsito ficam nulos, para o time comercial preencher na tela de Rotas.
--
-- Idempotente: só cria par que não existe vivo, só liga viagem com `lane_id` nulo.
INSERT INTO "lanes" ("customer_id", "origin_location_id", "destination_location_id")
SELECT DISTINCT t."customer_id", t."origin_location_id", t."destination_location_id"
FROM "trips" t
WHERE t."lane_id" IS NULL
  AND t."origin_location_id" <> t."destination_location_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "trips" t
SET "lane_id" = l."id", "updated_at" = now()
FROM "lanes" l
WHERE t."lane_id" IS NULL
  AND l."archived_at" IS NULL
  AND l."customer_id" = t."customer_id"
  AND l."origin_location_id" = t."origin_location_id"
  AND l."destination_location_id" = t."destination_location_id";
