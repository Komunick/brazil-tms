-- A oferta de spot que o monitor de leilão (VM Windows) já avisa no Telegram, agora também na TV.
--
-- Tabela separada de `trips` de propósito: oferta não é viagem — é convite para dar lance, e some
-- quando o leilão fecha. Guardá-la em `trips` criaria viagens fantasma que nunca aconteceram.
CREATE TABLE IF NOT EXISTS spot_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_trip_id text NOT NULL,
  trip_number text,
  route text NOT NULL,
  vehicle text,
  price text,
  departure text,
  arrival text,
  operator text,
  created_at_portal text,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- O monitor guarda "já vi" no localStorage do navegador dele. Reiniciou aquela VM, a memória zera e
-- ele reenvia o que ainda está em leilão — sem esta chave, um reinício de madrugada encheria a TV de
-- avisos de ofertas velhas.
CREATE UNIQUE INDEX IF NOT EXISTS spot_offers_portal_trip_uq ON spot_offers (portal_trip_id);

-- A TV pergunta "o que chegou nos últimos minutos?" a cada 30 segundos.
CREATE INDEX IF NOT EXISTS spot_offers_received_idx ON spot_offers (received_at DESC);
