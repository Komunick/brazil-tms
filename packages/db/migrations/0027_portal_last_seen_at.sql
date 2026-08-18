-- A última vez que a viagem apareceu numa listagem do portal (2026-08-18).
--
-- Serve a uma pergunta que nenhuma outra coluna responde: o cliente RETIROU esta viagem? O portal
-- não avisa — a proposta some do Planejado e pronto. Num único dia medido, 14 das 16 viagens
-- recebidas deixaram de existir lá, enquanto do lado de cá seguiam vivas, cobrando atribuição e
-- alertando.
--
-- NULO = nunca visto numa listagem. É diferente de "sumiu", e a diferença é o que protege a viagem
-- digitada à mão de ser confundida com uma retirada.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS portal_last_seen_at timestamptz;

-- Parcial: só viagem que veio do portal pode ter sido retirada dele.
CREATE INDEX IF NOT EXISTS trips_portal_last_seen_idx
  ON trips (portal_last_seen_at)
  WHERE portal_last_seen_at IS NOT NULL;

-- Semente para as que já existem: quem tem fato do portal gravado já foi vista alguma vez, e a
-- melhor aproximação que temos é a última atualização da linha. Sem isto, a primeira varredura
-- consideraria a base inteira "sumida" — exatamente o acidente que a varredura precisa não causar.
UPDATE trips
   SET portal_last_seen_at = updated_at
 WHERE portal_last_seen_at IS NULL
   AND customer_fields ? 'Status (portal)';
