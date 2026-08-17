-- O BSC do cliente, espelhado (2026-08-17).
--
-- A Shopee publica um scorecard num relatório do Looker Studio que fecha às 4h da manhã. Não existe
-- API para lê-lo; um script lê a tela e entrega aqui. O TMS não calcula essa nota — copia a que o
-- cliente deu, para que ela fique ao lado da operação em vez de numa aba separada.
--
-- O PERÍODO ENTRA NA CHAVE porque os mesmos indicadores dão números diferentes conforme o filtro:
-- medido no próprio relatório, a nota geral foi de 72,8 para 62,75 só ao trocar o recorte. Uma linha
-- sem período seria um número sem significado.
--
-- Os indicadores ficam em JSON porque os ~20 rótulos são do cliente e mudam quando ele quer (o
-- relatório já se chama "V3"). Uma coluna por indicador viraria migração a cada revisão do scorecard.

create table if not exists bsc_snapshots (
  id             uuid primary key default gen_random_uuid(),
  period         text not null,
  period_label   text,
  captured_at    timestamptz not null,
  received_at    timestamptz not null default now(),
  score          numeric(6, 2),
  zone           text,
  indicators     jsonb not null default '{}'::jsonb
);

-- Uma linha por publicação e período: o robô pode reenviar à vontade sem duplicar.
create unique index if not exists bsc_snapshots_period_captured_uq
  on bsc_snapshots (period, captured_at);

-- O histórico dia a dia — algo que o BSC não oferece, porque lá só existe o número de hoje.
create index if not exists bsc_snapshots_captured_at_idx
  on bsc_snapshots (captured_at);
