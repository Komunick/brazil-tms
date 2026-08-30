-- OS FILTROS QUE A PESSOA DEIXOU LIGADOS (30/08, a pedido).
--
-- "Permanecer os filtros do usuário quando ele voltar pro início e minha programação." Hoje eles
-- vivem em `useState`: sair da tela e voltar zera tudo, e quem cuida de uma frente refaz a mesma
-- escolha dezenas de vezes por dia.
--
-- ── POR QUE COLUNA NOVA, E NÃO UM PREFIXO DENTRO DE hidden_cards ─────────────────────────────
--
-- Porque o comentário de `minimized_cards`, logo acima desta tabela, já recusou exatamente isso:
-- juntar dois estados diferentes numa lista só "obrigaria a inventar um prefixo — que é onde este
-- tipo de lista começa a virar linguagem secreta que só o código entende". Vale igual aqui, e com
-- um agravante: a frente escolhida é uma SELEÇÃO, não um esconder, e guardá-la numa coluna chamada
-- `hidden_cards` mentiria para quem lesse a tabela.
--
-- ── POR QUE NO BANCO, E NÃO EM COOKIE OU localStorage ────────────────────────────────────────
--
-- Mesma razão de `user_dashboard_prefs` existir: A OPERAÇÃO COMPARTILHA MÁQUINA. Dois operadores no
-- mesmo computador veriam o filtro um do outro, e o segundo desfaria a escolha do primeiro sem
-- perceber. A preferência é da pessoa, então segue a pessoa — inclusive em outra máquina.
--
-- ── jsonb, E NÃO TRÊS COLUNAS ────────────────────────────────────────────────────────────────
--
-- Aqui a lista NÃO é fechada como a de cartões: são os filtros de uma tela que ainda está mudando
-- toda semana. Três colunas hoje viram uma migração a cada filtro novo. O conteúdo é preferência de
-- tela — preferência errada não corrompe nada —, e o Zod valida a forma antes de gravar.
--
-- O DEFAULT É '{}' e não NULL: "nunca escolheu" e "escolheu nada" dão no mesmo resultado, e um
-- default vazio poupa todo leitor de decidir o que fazer com o nulo.

ALTER TABLE user_dashboard_prefs
  ADD COLUMN IF NOT EXISTS programacao_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN user_dashboard_prefs.programacao_prefs IS
  'Filtros lembrados da Minha Programação: frentes escolhidas, status escondidos, ocultas à mostra. Preferência de tela, por pessoa.';
