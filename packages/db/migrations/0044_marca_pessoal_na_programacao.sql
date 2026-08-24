-- A PROGRAMAÇÃO DEIXA DE SER UMA LISTA E VIRA O QUADRO (2026-08-24, a pedido).
--
-- A tela nasceu como lista pessoal: a pessoa procurava a LH e a acrescentava. O pedido agora é
-- substituir a planilha "PROGRAMAÇÃO 2026" — 12.317 linhas, uma por LH, colorida à mão —, e isso
-- inverte o desenho: o quadro mostra TUDO por dia, e o que é pessoal vira uma camada por cima.
--
-- Por isso a tabela não é trocada, é ESTENDIDA. Ela já era exatamente uma linha por (pessoa,
-- viagem), que é a forma certa para a camada pessoal; o que muda é o que essa linha carrega. As
-- linhas existentes continuam válidas — quem já acompanhava uma LH continua com ela marcada.
ALTER TABLE "user_watched_trips" ADD COLUMN IF NOT EXISTS "cor" text;--> statement-breakpoint

-- OCULTAR É DECISÃO DE QUEM OLHA, e por isso é `false` por padrão: o quadro mostra tudo até alguém
-- dizer o contrário. O contrário — nascer escondido e a pessoa ir revelando — faria a tela abrir
-- vazia no primeiro uso e parecer quebrada.
ALTER TABLE "user_watched_trips" ADD COLUMN IF NOT EXISTS "oculta" boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- A cor é TEXTO e não um enum, de propósito. A planilha usa a paleta inteira do Google e ninguém
-- combinou o que cada cor significa — é sinal particular de quem marca. Um enum obrigaria a decidir
-- hoje uma lista que a operação ainda não tem, e a primeira cor que faltasse viraria migração.
-- A guarda contra lixo é o CHECK de comprimento; a paleta de fato oferecida mora na tela.
ALTER TABLE "user_watched_trips"
  ADD CONSTRAINT "user_watched_trips_cor_ck" CHECK ("cor" IS NULL OR length("cor") <= 24);
