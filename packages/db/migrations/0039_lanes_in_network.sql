-- A MALHA VIRA CADASTRO: quais rotas a empresa roda (2026-08-23). Ver `schema/lanes.ts`.
--
-- O TMS já registrava toda rota que via — `resolveLaneId` cria a lane na primeira viagem do par.
-- O que faltava era dizer QUAIS delas são nossas. Sem isso, o painel tratava proposta alheia como
-- trabalho da casa e acendia alarme para 40 viagens que ninguém ia rodar.
ALTER TABLE "lanes"
  ADD COLUMN IF NOT EXISTS "in_network" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- O ARRANQUE SAI DO HISTÓRICO, e é a única fonte honesta que existe: o portal não publica à
-- transportadora um cadastro de "suas rotas", e a planilha da operação lista só a ESTAÇÃO de origem
-- — que não distingue (as 16 viagens reprovadas em 23/08 saíam de três estações nossas).
--
-- Entra na malha a rota que a empresa PROVOU rodar: viagem que chegou à origem, rodou ou terminou.
-- Cancelada não conta: cancelar é o oposto de ter rodado.
--
-- E entra também a rota com viagem ACEITA, mesmo que nunca tenha rodado — aceitar é o ato que torna
-- a rota nossa. Foi assim que 8 viagens de Jaboatão → Simões Filho apareceram: rota nova de verdade,
-- que o cadastro ainda não conhecia.
UPDATE "lanes" l SET "in_network" = true
WHERE EXISTS (
  SELECT 1 FROM "trips" t
  WHERE t.origin_location_id = l.origin_location_id
    AND t.destination_location_id = l.destination_location_id
    AND t.customer_id = l.customer_id
    AND (
      t.current_status IN ('at_origin','in_transit','at_destination','completed','billing_pending','billed','disputed')
      OR (t.customer_fields ->> 'Aceitação (portal)') = 'Accepted'
    )
);
