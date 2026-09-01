-- UMA PESSOA PASSA A TER VÁRIOS CARGOS (2026-09-01, decisão do usuário)
--
-- ── A DECISÃO SE INVERTEU, E O CASO QUE A INVERTEU ───────────────────────────────────────────
--
-- A fatia 029 decidiu UM cargo por pessoa, contra o modelo de somar. A razão registrada era boa:
-- somando, fica impossível responder "por que fulano consegue cancelar?" — a resposta vira "olhe
-- todos os cargos dele e some".
--
-- O caso que derrubou isso apareceu no dia seguinte, e é concreto: uma pessoa é do setor GR E
-- cuida do spot. Com um cargo só, dar-lhe o SPOT tira a GR. Não há como existir alguém com duas
-- funções — e é exatamente para poder ter duas que os cargos foram criados.
--
-- O CUSTO CONTINUA VALENDO e não some por a decisão ter mudado: a pergunta "de onde vem esse
-- acesso?" passa a ter mais de uma resposta possível. Quem for construir a tela de conferência
-- depois precisa mostrar QUAL cargo concede cada capacidade, senão a pergunta fica sem dono.
--
-- ── ADITIVA, e `users.cargo_id` CONTINUA VIVO ────────────────────────────────────────────────
--
-- O deploy migra ANTES do build, e durante o build o app ANTERIOR continua servindo — e ele lê
-- `users.cargo_id` para montar a sessão. Removê-lo aqui derrubaria o acesso de todo mundo pelos
-- minutos da construção.
--
-- Ele para de decidir acesso quando o código novo sobe, e sai numa fatia futura. Até lá fica como
-- está: escrito pelo cadastro de usuário e ignorado por quem lê permissão.

create table if not exists usuario_cargos (
  user_id   uuid not null references users(id) on delete cascade,
  cargo_id  uuid not null references cargos(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (user_id, cargo_id)
);
--> statement-breakpoint

-- A pergunta da trava do último admin começa pelo CARGO: "quem está neste cargo?". A chave
-- primária composta só serve a quem começa pela pessoa.
create index if not exists usuario_cargos_cargo_idx on usuario_cargos (cargo_id);
--> statement-breakpoint

-- ── A SEMEADURA: ninguém pode perder acesso na virada ────────────────────────────────────────
--
-- Cada pessoa entra com o cargo que já tinha. Depois desta linha, a união dos cargos de qualquer
-- pessoa é EXATAMENTE o que ela tinha antes — a migração não concede nada e não tira nada.
--
-- É a mesma cautela da 0060, e pelo mesmo motivo: quem ficasse de fora não conseguiria entrar para
-- consertar.
insert into usuario_cargos (user_id, cargo_id)
select u.id, u.cargo_id from users u where u.cargo_id is not null
on conflict do nothing;
