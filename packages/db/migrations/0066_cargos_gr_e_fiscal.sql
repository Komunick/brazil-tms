-- OS CARGOS GR E FISCAL, E AS DUAS MARCAS QUE ELES FAZEM (fatia 032, 2026-09-05)
--
-- ── O DEFEITO QUE ISTO CONSERTA ──────────────────────────────────────────────────────────────────
--
-- Relato do usuário: "alguns usuários não estão conseguindo marcar" o V e o X de SM e CTE.
-- Medido em produção no mesmo dia: a rota exigia `assign_resources`, e
--
--     Programador ............ 26 usuários ativos ... NÃO tem assign_resources
--     Administrador .......... 23 usuários ativos ... tem
--     Gerente de operações .... 1 usuário  ativo  ... tem
--
-- Metade da casa não conseguia — e era o cargo de quem vive na tela de Minha Programação. O mesmo
-- cargo pode cancelar viagem, mudar status, editar o plano e subir documento; não podia marcar um V.
--
-- ── A DECISÃO (usuário, 05/09) ───────────────────────────────────────────────────────────────────
--
-- "Crie o cargo GR e o cargo Fiscal, eles são do setor que marcam essas funções."
--
--     GR ......... emite a SM  → marcar_sm
--     Fiscal ..... emite o CTE → marcar_cte
--
-- Duas chaves e não uma, porque são dois setores: uma chave só deixaria cada um marcar a coluna do
-- outro, e a coluna existe justamente para dizer que AQUELE setor fez a parte dele.
--
-- ── O QUE ESTA MIGRAÇÃO PRECISA NÃO QUEBRAR ──────────────────────────────────────────────────────
--
-- A permissão ESTREITOU: antes bastava `assign_resources`, agora cada marca pede a sua. Sem os
-- blocos 3 e 4, todo mundo que marcava hoje PERDERIA a marcação no deploy — os 23 administradores
-- inclusive. Medido: 4 cargos e 24 usuários ativos dependem disso.
--
-- ── POR QUE NOMEADO **E** DINÂMICO ───────────────────────────────────────────────────────────────
--
-- O bloco 3 concede por NOME. É o que `cargos-schema.test.ts` consegue ler — ele casa o padrão
-- `where nome = 'X'), 'permissao')` no SQL, e é assim que a semeadura fica conferível contra
-- `ROLE_PERMISSIONS` sem ninguém precisar rodar a migração.
--
-- O bloco 4 concede a QUALQUER cargo com `assign_resources`. Desde a fatia 029 os cargos são
-- criados pela tela, sem tocar em código — pode existir hoje, em produção, um cargo que a lista
-- nomeada não conhece. Sem ele, esse cargo perderia a marcação em silêncio.
--
-- Os dois juntos não são redundância: um é conferível, o outro é completo. `on conflict do nothing`
-- faz o segundo passar por cima do primeiro sem erro.
--
-- ── O QUE ESTA MIGRAÇÃO DELIBERADAMENTE NÃO FAZ ──────────────────────────────────────────────────
--
-- NÃO dá as marcas ao cargo Programador. Mover as 26 pessoas para GR ou Fiscal — ou conceder a
-- marca ao Programador — é decisão de organização, não de código, e se faz em Sistema → Cargos sem
-- deploy. Fazer isso aqui seria decidir pela operação em nome dela.

-- 1. Os dois cargos. `on conflict do nothing` porque alguém pode tê-los criado pela tela antes do
--    deploy, e a migração não pode falhar por isso.
insert into cargos (nome) values ('GR'), ('Fiscal')
on conflict (nome) do nothing;

-- 2. O que cada um pode. `view_all_trips` porque sem ela a pessoa não enxerga Minha Programação, e
--    permissão de marcar numa tela invisível não serve para nada.
insert into cargo_permissoes (cargo_id, permissao) values
  ((select id from cargos where nome = 'GR'), 'view_all_trips'),
  ((select id from cargos where nome = 'GR'), 'marcar_sm'),
  ((select id from cargos where nome = 'Fiscal'), 'view_all_trips'),
  ((select id from cargos where nome = 'Fiscal'), 'marcar_cte')
on conflict do nothing;

-- 3. NINGUÉM PERDE O QUE JÁ TINHA — os cargos semeados que têm `assign_resources`.
insert into cargo_permissoes (cargo_id, permissao) values
  ((select id from cargos where nome = 'Administrador'), 'marcar_sm'),
  ((select id from cargos where nome = 'Administrador'), 'marcar_cte'),
  ((select id from cargos where nome = 'Gerente de operações'), 'marcar_sm'),
  ((select id from cargos where nome = 'Gerente de operações'), 'marcar_cte'),
  ((select id from cargos where nome = 'Despachante'), 'marcar_sm'),
  ((select id from cargos where nome = 'Despachante'), 'marcar_cte'),
  ((select id from cargos where nome = 'Coordenador de frota'), 'marcar_sm'),
  ((select id from cargos where nome = 'Coordenador de frota'), 'marcar_cte'),
  ((select id from cargos where nome = 'SPOT'), 'marcar_sm'),
  ((select id from cargos where nome = 'SPOT'), 'marcar_cte')
on conflict do nothing;

-- 4. E o mesmo para qualquer cargo criado PELA TELA que tenha `assign_resources` — ver o bloco
--    "POR QUE NOMEADO E DINÂMICO" acima.
insert into cargo_permissoes (cargo_id, permissao)
select cp.cargo_id, p.permissao
from cargo_permissoes cp
cross join (values ('marcar_sm'), ('marcar_cte')) as p(permissao)
where cp.permissao = 'assign_resources'
on conflict do nothing;
