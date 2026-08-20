-- A região operacional da estação, como o cliente a declara (2026-08-20).
--
-- Três valores, do vocabulário da operação e não do IBGE: NONE (Norte + Nordeste), SUDESTE e SULCO
-- (Sul + Centro-Oeste). Texto e não enum: a lista é do cliente e muda por decisão dele.
--
-- O valor é COPIADO da planilha do cliente, nunca deduzido da UF: Palmas/TO e Itaitinga/CE estão em
-- SULCO e Guanambi/BA em SUDESTE, contra a geografia, porque são exceções que a operação decidiu.
--
-- Nulo é estação ainda não classificada — não é uma quarta região.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS region text;

-- Os cartões do painel agrupam viagens por região da estação de ORIGEM.
CREATE INDEX IF NOT EXISTS locations_region_idx ON locations (region);
