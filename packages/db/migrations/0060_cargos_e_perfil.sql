-- 029 · CARGOS EDITÁVEIS, MINI PERFIL E SELOS
--
-- O acesso ao TMS deixa de ser catálogo em código e passa a ser dado. Medido antes de escrever isto:
-- dos 34 usuários ativos, 20 eram `admin` — porque o catálogo de papéis vive em código, e quem
-- precisava de uma combinação que não existia nele virava admin.
--
-- ESTA MIGRAÇÃO É ADITIVA, E ISSO NÃO É ESTILO — É NECESSIDADE.
--
-- O deploy deste repositório NÃO aplica migração (docs/OPERACAO.md): ela roda À MÃO, e nesse momento
-- quem está respondendo em produção é o app ANTERIOR, que lê `users.role` e cria usuário sem saber
-- preencher `cargo_id`. Por isso, e sem exceção:
--
--   * `users.role` NÃO é removido
--   * o enum `app_role` NÃO é tocado
--   * `users.cargo_id` nasce NULO (o `not null` é de uma fatia futura, com o app novo já no ar)
--
-- Há um teste lendo este arquivo para garantir que essas três coisas continuem verdadeiras
-- (`packages/db/src/cargos/cargos-schema.test.ts`). Se ele cair, não "conserte o teste".

create table cargos (
  id             uuid primary key default gen_random_uuid(),
  -- RÓTULO, não chave: renomear não muda o acesso de ninguém.
  nome           text not null unique,
  -- Desativar em vez de apagar (princípio III). Apagar levaria junto o histórico de quem esteve nele.
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- UMA LINHA POR CAPACIDADE, e não um array.
--
-- A pergunta que decide esta forma é a da trava do último administrador, feita dentro de uma
-- transação e sob concorrência: "quantas pessoas ATIVAS ainda alcançam `manage_users`?". Assim ela é
-- um join comum com índice comum. Com jsonb/array viraria varredura de contenção e pediria GIN.
--
-- SEM CHECK amarrando ao catálogo, de propósito: as capacidades vivem em TypeScript e crescem a cada
-- fatia. Um CHECK aqui exigiria migração a cada capacidade nova. Quem valida é o Zod na rota, e uma
-- chave que o código não reconhece nunca é concedida por `can` — falha FECHADA.
create table cargo_permissoes (
  cargo_id   uuid not null references cargos(id) on delete cascade,
  permissao  text not null,
  primary key (cargo_id, permissao)
);

-- A pergunta da trava começa pela PERMISSÃO; a chave primária composta só serve a quem começa pelo
-- cargo.
create index cargo_permissoes_permissao_idx on cargo_permissoes (permissao);

-- OS SELOS — reconhecimento, e NUNCA acesso.
-- A separação é física: não existe caminho de `usuario_selos` até `cargo_permissoes`. É isso que
-- torna a regra verificável sem depender da disciplina de quem escrever o código depois.
create table selos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  cor        text not null,
  criado_em  timestamptz not null default now()
);

create table usuario_selos (
  user_id       uuid not null references users(id) on delete cascade,
  selo_id       uuid not null references selos(id) on delete cascade,
  aplicado_por  uuid not null references users(id),
  aplicado_em   timestamptz not null default now(),
  primary key (user_id, selo_id)
);

create index usuario_selos_selo_idx on usuario_selos (selo_id);

-- NULO DE PROPÓSITO — ver o cabeçalho. A chave estrangeira existe aqui e NÃO no schema do drizzle,
-- onde declará-la criaria um ciclo de importação com `cargos.ts`.
alter table users add column cargo_id uuid references cargos(id);

-- O relógio dos 90 dias da foto de perfil. Zerado ao reativar, e é assim que a reativação para o
-- relógio sem nenhuma regra especial: a varredura diária filtra por esta coluna.
alter table users add column desativado_em timestamptz;

-- A FOTO DE PERFIL ENTRA NO ARMAZENAMENTO QUE JÁ EXISTE (fatia 025), e só a COLUNA é alargada.
--
-- `RESOURCE_DOCUMENT_ENTITY_TYPES` — a PORTA das rotas de frota — continua `driver|vehicle`.
-- Alargar as duas faria a rota de frota procurar o pai em `drivers`/`vehicles` e não achar; o
-- comentário em `schema/resource-documents.ts` avisa disso. A foto tem rota própria.
alter table resource_documents drop constraint resource_documents_entity_type_ck;
alter table resource_documents add constraint resource_documents_entity_type_ck
  check (entity_type in ('driver', 'vehicle', 'preregistration', 'user'));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- A SEMEADURA: cada papel de hoje vira um cargo equivalente, e cada pessoa já aponta para o seu.
--
-- SETE cargos, e não oito. O enum `app_role` tem 8 valores, mas `ROLE_PERMISSIONS` tem 7:
-- `customer_viewer` está no banco e NÃO está no catálogo — não é papel atribuível (FR-007 da fatia
-- 001) e não passa a ser cargo (FR-017).
--
-- Escrito literalmente, e não gerado em tempo de execução: esta migração semeia o acesso de 34
-- pessoas e precisa poder ser LIDA e conferida por gente antes de rodar.
--
-- Depois de aplicar, rode a conferência ANTES de publicar qualquer código novo:
--   pnpm --filter @brazil-tms/db db:conferir-acesso     → "34 pessoas · 34 idênticas · 0 divergentes"
-- ─────────────────────────────────────────────────────────────────────────────────────────────

insert into cargos (nome) values
  ('Administrador'),         -- admin
  ('Gerente de operações'),  -- operations_manager
  ('Despachante'),           -- dispatcher
  ('Torre de controle'),     -- control_tower
  ('Coordenador de frota'),  -- fleet_coordinator
  ('Financeiro'),            -- finance
  ('Diretoria (leitura)'),   -- executive_viewer
  -- O OITAVO CARGO NÃO VEM DO CATÁLOGO, e existe por causa de uma linha real no banco.
  --
  -- A simulação desta migração (rodada no dev, dentro de uma transação desfeita) mostrou UMA pessoa
  -- ficando sem cargo. Ela tem `role = 'customer_viewer'` e está desativada — e produção tem uma
  -- igual. Esse valor está no enum `app_role` e NÃO está em `ROLE_PERMISSIONS`, então os sete
  -- `update` abaixo não a alcançariam.
  --
  -- Deixá-la com `cargo_id` nulo violaria o FR-011 ("ninguém fica sem cargo") já no primeiro minuto,
  -- e faria a conferência do FR-015 comparar contra um papel que não existe no catálogo.
  --
  -- Este cargo NÃO é `customer_viewer` virando cargo (o FR-017 continua valendo): é um cargo VAZIO,
  -- e vazio é exatamente o que essa pessoa alcança hoje — `can` faz
  -- `ROLE_PERMISSIONS[role]?.has(...) ?? false`, e para um papel fora do catálogo isso é false para
  -- tudo. O comportamento é idêntico ao de antes; o que muda é que agora está DITO.
  ('Sem acesso');            -- o destino de quem não tem papel no catálogo

-- Administrador  (papel `admin`, 23 capacidades)
insert into cargo_permissoes (cargo_id, permissao) values
    ((select id from cargos where nome = 'Administrador'), 'manage_users'),
    ((select id from cargos where nome = 'Administrador'), 'view_audit_log'),
    ((select id from cargos where nome = 'Administrador'), 'view_all_trips'),
    ((select id from cargos where nome = 'Administrador'), 'import_trips'),
    ((select id from cargos where nome = 'Administrador'), 'edit_trip_plan'),
    ((select id from cargos where nome = 'Administrador'), 'assign_resources'),
    ((select id from cargos where nome = 'Administrador'), 'update_trip_status'),
    ((select id from cargos where nome = 'Administrador'), 'cancel_trip'),
    ((select id from cargos where nome = 'Administrador'), 'mark_completed'),
    ((select id from cargos where nome = 'Administrador'), 'mark_billing_ready'),
    ((select id from cargos where nome = 'Administrador'), 'resolve_dispute'),
    ((select id from cargos where nome = 'Administrador'), 'delete_archive'),
    ((select id from cargos where nome = 'Administrador'), 'create_exceptions'),
    ((select id from cargos where nome = 'Administrador'), 'resolve_exceptions'),
    ((select id from cargos where nome = 'Administrador'), 'upload_documents'),
    ((select id from cargos where nome = 'Administrador'), 'verify_documents'),
    ((select id from cargos where nome = 'Administrador'), 'edit_rates'),
    ((select id from cargos where nome = 'Administrador'), 'export_billing'),
    ((select id from cargos where nome = 'Administrador'), 'manage_commercial_data'),
    ((select id from cargos where nome = 'Administrador'), 'manage_fleet_data'),
    ((select id from cargos where nome = 'Administrador'), 'manage_trips'),
    ((select id from cargos where nome = 'Administrador'), 'view_freight_rates'),
    ((select id from cargos where nome = 'Administrador'), 'import_freight_rates');

-- Gerente de operações  (papel `operations_manager`, 16 capacidades)
insert into cargo_permissoes (cargo_id, permissao) values
    ((select id from cargos where nome = 'Gerente de operações'), 'view_all_trips'),
    ((select id from cargos where nome = 'Gerente de operações'), 'import_trips'),
    ((select id from cargos where nome = 'Gerente de operações'), 'edit_trip_plan'),
    ((select id from cargos where nome = 'Gerente de operações'), 'assign_resources'),
    ((select id from cargos where nome = 'Gerente de operações'), 'update_trip_status'),
    ((select id from cargos where nome = 'Gerente de operações'), 'cancel_trip'),
    ((select id from cargos where nome = 'Gerente de operações'), 'mark_completed'),
    ((select id from cargos where nome = 'Gerente de operações'), 'resolve_dispute'),
    ((select id from cargos where nome = 'Gerente de operações'), 'create_exceptions'),
    ((select id from cargos where nome = 'Gerente de operações'), 'resolve_exceptions'),
    ((select id from cargos where nome = 'Gerente de operações'), 'upload_documents'),
    ((select id from cargos where nome = 'Gerente de operações'), 'verify_documents'),
    ((select id from cargos where nome = 'Gerente de operações'), 'manage_commercial_data'),
    ((select id from cargos where nome = 'Gerente de operações'), 'manage_fleet_data'),
    ((select id from cargos where nome = 'Gerente de operações'), 'manage_trips'),
    ((select id from cargos where nome = 'Gerente de operações'), 'view_freight_rates');

-- Despachante  (papel `dispatcher`, 9 capacidades)
insert into cargo_permissoes (cargo_id, permissao) values
    ((select id from cargos where nome = 'Despachante'), 'view_all_trips'),
    ((select id from cargos where nome = 'Despachante'), 'edit_trip_plan'),
    ((select id from cargos where nome = 'Despachante'), 'assign_resources'),
    ((select id from cargos where nome = 'Despachante'), 'update_trip_status'),
    ((select id from cargos where nome = 'Despachante'), 'cancel_trip'),
    ((select id from cargos where nome = 'Despachante'), 'create_exceptions'),
    ((select id from cargos where nome = 'Despachante'), 'resolve_exceptions'),
    ((select id from cargos where nome = 'Despachante'), 'upload_documents'),
    ((select id from cargos where nome = 'Despachante'), 'view_freight_rates');

-- Torre de controle  (papel `control_tower`, 8 capacidades)
insert into cargo_permissoes (cargo_id, permissao) values
    ((select id from cargos where nome = 'Torre de controle'), 'view_all_trips'),
    ((select id from cargos where nome = 'Torre de controle'), 'edit_trip_plan'),
    ((select id from cargos where nome = 'Torre de controle'), 'update_trip_status'),
    ((select id from cargos where nome = 'Torre de controle'), 'mark_completed'),
    ((select id from cargos where nome = 'Torre de controle'), 'create_exceptions'),
    ((select id from cargos where nome = 'Torre de controle'), 'resolve_exceptions'),
    ((select id from cargos where nome = 'Torre de controle'), 'upload_documents'),
    ((select id from cargos where nome = 'Torre de controle'), 'view_freight_rates');

-- Coordenador de frota  (papel `fleet_coordinator`, 7 capacidades)
insert into cargo_permissoes (cargo_id, permissao) values
    ((select id from cargos where nome = 'Coordenador de frota'), 'view_all_trips'),
    ((select id from cargos where nome = 'Coordenador de frota'), 'assign_resources'),
    ((select id from cargos where nome = 'Coordenador de frota'), 'create_exceptions'),
    ((select id from cargos where nome = 'Coordenador de frota'), 'resolve_exceptions'),
    ((select id from cargos where nome = 'Coordenador de frota'), 'upload_documents'),
    ((select id from cargos where nome = 'Coordenador de frota'), 'manage_fleet_data'),
    ((select id from cargos where nome = 'Coordenador de frota'), 'view_freight_rates');

-- Financeiro  (papel `finance`, 9 capacidades)
insert into cargo_permissoes (cargo_id, permissao) values
    ((select id from cargos where nome = 'Financeiro'), 'view_all_trips'),
    ((select id from cargos where nome = 'Financeiro'), 'mark_billing_ready'),
    ((select id from cargos where nome = 'Financeiro'), 'resolve_dispute'),
    ((select id from cargos where nome = 'Financeiro'), 'upload_documents'),
    ((select id from cargos where nome = 'Financeiro'), 'verify_documents'),
    ((select id from cargos where nome = 'Financeiro'), 'edit_rates'),
    ((select id from cargos where nome = 'Financeiro'), 'export_billing'),
    ((select id from cargos where nome = 'Financeiro'), 'view_freight_rates'),
    ((select id from cargos where nome = 'Financeiro'), 'import_freight_rates');

-- Diretoria (leitura)  (papel `executive_viewer`, 2 capacidades)
insert into cargo_permissoes (cargo_id, permissao) values
    ((select id from cargos where nome = 'Diretoria (leitura)'), 'view_all_trips'),
    ((select id from cargos where nome = 'Diretoria (leitura)'), 'view_freight_rates');

update users set cargo_id = (select id from cargos where nome = 'Administrador') where role = 'admin';
update users set cargo_id = (select id from cargos where nome = 'Gerente de operações') where role = 'operations_manager';
update users set cargo_id = (select id from cargos where nome = 'Despachante') where role = 'dispatcher';
update users set cargo_id = (select id from cargos where nome = 'Torre de controle') where role = 'control_tower';
update users set cargo_id = (select id from cargos where nome = 'Coordenador de frota') where role = 'fleet_coordinator';
update users set cargo_id = (select id from cargos where nome = 'Financeiro') where role = 'finance';
update users set cargo_id = (select id from cargos where nome = 'Diretoria (leitura)') where role = 'executive_viewer';

-- A REDE, e ela não é zelo excessivo: é o que faz o FR-011 valer para TODA linha da tabela, e não só
-- para as que eu soube antecipar. Se o enum `app_role` ganhar um valor amanhã e alguém esquecer de
-- semear o cargo dele, essa pessoa cai aqui em vez de ficar sem cargo nenhum.
--
-- Vazio é o lado certo de errar: quem cair aqui entra no sistema e não vê nada, e a tela diz "sem
-- cargo definido". O outro lado do erro seria conceder algo que ninguém pediu.
update users set cargo_id = (select id from cargos where nome = 'Sem acesso') where cargo_id is null;
