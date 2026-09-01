-- A DISPENSA PESSOAL DE UMA OFERTA DE SPOT (2026-09-01, a pedido)
--
-- "Esta pessoa tirou esta oferta da própria tela." Não é decisão sobre o frete — é decisão sobre a
-- tela de quem clicou. A oferta continua com os colegas até alguém aceitar, e continua no registro
-- do dia para todos.
--
-- ── POR QUE ESTA É A ÚNICA TABELA DA FATIA ────────────────────────────────────────────────────
--
-- O cartão precisa distinguir cinco situações, e QUATRO delas já estão gravadas em produção:
--
--   esperando decisão  →  trips.customer_fields->>'Aceitação (portal)' = 'Pending'
--   aceite enviado     →  portal_commands com action='accept' e status pending/sent
--   o portal recusou   →  portal_commands.status='failed' + last_error
--   aceito             →  trips.customer_fields->>'Aceitação (portal)' = 'Accepted'
--
-- Só "quem ignorou o quê" não existe em lugar nenhum. E não guardar as outras quatro não é economia:
-- é o que impede uma segunda verdade. Das 19 ofertas dos últimos dois dias, quase todas foram aceitas
-- DIRETO NO PORTAL — uma coluna nossa de "aceita" continuaria dizendo "esperando" para sempre.
--
-- ── A CHAVE PRIMÁRIA COMPOSTA É A REGRA DE NEGÓCIO ────────────────────────────────────────────
--
-- Dispensar duas vezes é a mesma dispensa. Com `(spot_offer_id, user_id)` como PK, a gravação vira
-- `insert … on conflict do nothing` — idempotente, e duas abas clicando junto não se atropelam.
--
-- Nenhum índice além dela: a única leitura é `not exists (… where spot_offer_id = ? and user_id = ?)`,
-- que é exatamente o prefixo da PK. Um índice por `user_id` sozinho seria especulação — não há
-- leitura que peça "tudo o que fulano dispensou".
--
-- ── A CASCATA PELA OFERTA É OBRIGATÓRIA; PELO AUTOR, PROIBIDA ─────────────────────────────────
--
-- Se um dia uma oferta for removida, a dispensa dela não pode travar a remoção. Já a dispensa de
-- alguém que saiu da empresa não deve desaparecer sozinha: ela explica por que aquela oferta não
-- estava na tela daquela pessoa, e apagá-la apagaria a explicação.
--
-- ── ADITIVA, e roda com o app ANTERIOR no ar ─────────────────────────────────────────────────
--
-- O deploy migra ANTES do build, e durante o build (minutos) o app antigo continua servindo. Tabela
-- que ninguém conhece não incomoda ninguém: ela nasce vazia e sem leitor.

CREATE TABLE IF NOT EXISTS "spot_offer_dispensas" (
  "spot_offer_id" uuid NOT NULL REFERENCES "spot_offers"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "dispensada_em" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "spot_offer_dispensas_pk" PRIMARY KEY ("spot_offer_id", "user_id")
);
