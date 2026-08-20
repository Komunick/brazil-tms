-- O que o Agency Router da SPX empurra, gravado cru (2026-08-20).
--
-- Nunca recebemos um payload real: o que existe é a impressão de uma página interna de abril/2025
-- com exemplos de viagem de teste. Mapear para `trips` agora seria codificar palpite. Esta primeira
-- versão recebe, confere a assinatura, guarda o JSON inteiro e responde sucesso; o mapeamento se
-- escreve quando houver dado de verdade — e o histórico já estará aqui.
CREATE TABLE IF NOT EXISTS spx_router_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id text NOT NULL,
  data_type integer,
  agency_id text,
  business_name text,
  trip_number text,
  payload jsonb NOT NULL,
  signed_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- Toda entrega push é reenviada quando o remetente não vê a resposta. O `trace_id` acompanha o
-- evento, então a segunda entrega vira DO NOTHING e ainda responde sucesso — recusar com erro faria
-- a Shopee retentar para sempre um evento que já temos.
CREATE UNIQUE INDEX IF NOT EXISTS spx_router_events_trace_uq ON spx_router_events (trace_id);

-- "o que chegou dessa viagem?" se pergunta olhando uma viagem específica.
CREATE INDEX IF NOT EXISTS spx_router_events_trip_idx ON spx_router_events (trip_number);

-- "está chegando?" é sempre sobre o mais recente, como no diagnóstico dos outros robôs.
CREATE INDEX IF NOT EXISTS spx_router_events_received_idx ON spx_router_events (received_at DESC);
