/*
 * O PRÉ-CADASTRO DE MOTORISTA PARCEIRO, preenchido pelo PRÓPRIO motorista (fatia 028).
 *
 * ── POR QUE ELE EXISTE, E POR QUE TEM DATA ────────────────────────────────────────────────────
 *
 * Hoje o motorista manda os documentos, um funcionário abre a tela da gerenciadora e digita à mão
 * um formulário de quatro abas com uns 20 campos. São mais de 5 por dia — mais de 150 por mês.
 *
 * Em 10/09/2026 há um evento com mais de 50 motoristas e NINGUÉM do escritório presente. É a data
 * que manda nesta migração: as duas tabelas aqui são o que precisa existir para que um envio feito
 * do celular do motorista chegue a algum lugar. Leitura de CNH, conferência e envio à gerenciadora
 * vêm depois e não podem bloquear.
 *
 * ── POR QUE DUAS TABELAS, E NÃO UMA ───────────────────────────────────────────────────────────
 *
 * `driver_preregistrations` é o pré-cadastro — UM por CPF, mutável, é o que a fila mostra e o que a
 * conferência corrige. `driver_preregistration_submissions` é cada ENVIO, e nunca é alterado depois
 * de escrito.
 *
 * Uma tabela só obrigaria a escolher entre duas coisas incompatíveis: ou o reenvio sobrescreve o
 * anterior (e some a prova do que a pessoa mandou), ou cada envio vira uma linha na fila (e o mesmo
 * motorista aparece três vezes para conferir). Com duas, o reenvio ANEXA: a fila continua com uma
 * linha por pessoa e o histórico fica inteiro.
 *
 * É a mesma razão pela qual `portal_commands.response` guarda o corpo cru do portal — e ontem foi
 * exatamente essa decisão que permitiu achar um defeito que a versão traduzida escondia.
 *
 * ── O ÍNDICE ÚNICO É PARCIAL, E ISSO É O PRINCÍPIO III ─────────────────────────────────────────
 *
 * Descartar ARQUIVA, não apaga. Um CPF arquivado pode voltar — alguém descartou por engano, ou a
 * pessoa se recadastra meses depois. O que não pode existir são dois pré-cadastros ABERTOS para o
 * mesmo CPF, e é isso que o índice impede no banco, sem depender de a aplicação lembrar.
 *
 * ── O QUE ESTA MIGRAÇÃO NÃO FAZ ───────────────────────────────────────────────────────────────
 *
 * NÃO toca em `drivers`. Nos três casos de CPF (novo, já na fila, já é motorista) o cadastro real
 * fica intocado: ele só muda depois da conferência, por decisão explícita de uma pessoa. Um
 * formulário público que escreve direto no cadastro de motorista seria uma porta aberta.
 *
 * NÃO cria coluna de foto. As fotos entram por `resource_documents` (fatia 025, já implementada:
 * bucket privado, histórico, link de curta duração), e aqui só ficam as chaves estrangeiras.
 *
 * Escrita À MÃO, como toda migração deste repositório: o `drizzle-kit generate` diffa contra o
 * snapshot 0024 e recria tabelas de produção.
 */

CREATE TYPE driver_preregistration_type AS ENUM ('novo', 'atualizacao');

CREATE TYPE driver_preregistration_status AS ENUM (
  'recebido',
  'em_conferencia',
  'pronto',
  'enviado',
  'arquivado'
);

CREATE TABLE driver_preregistrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Só dígitos, normalizado na entrada. O formulário aceita "390.533.447-05"; aqui chega
  -- "39053344705", senão a deduplicação falharia por pontuação e o mesmo motorista viraria dois.
  cpf text NOT NULL,

  -- Decidido NO RECEBIMENTO, não depois: CPF que não existe em lugar nenhum é `novo`; CPF de
  -- motorista ativo é `atualizacao` e carrega o id dele. Um CPF que já tem pré-cadastro aberto não
  -- gera linha nenhuma — o envio é anexado ao que existe.
  tipo driver_preregistration_type NOT NULL,
  driver_id uuid REFERENCES drivers (id),

  status driver_preregistration_status NOT NULL DEFAULT 'recebido',

  -- Os valores consolidados COM A ORIGEM de cada um (lido do documento / do CEP / digitado /
  -- declarado). A origem é requisito da conferência: quem confere precisa saber o que foi lido por
  -- máquina e o que a pessoa digitou, para olhar com atenção diferente.
  campos jsonb NOT NULL DEFAULT '{}'::jsonb,

  /*
   * O TOXICOLÓGICO NÃO EXISTE NA API DA GERENCIADORA.
   *
   * Zero ocorrências em todo o manual (62 métodos, lido do PDF e não da conversão HTML). Ele mora
   * só na tela deles. Então aqui ele é capturado como declaração e marcado como AÇÃO MANUAL, com
   * quem resolveu e quando — nunca um endpoint inventado.
   */
  pendencia_toxicologico boolean NOT NULL DEFAULT true,
  toxicologico_resolvido_por uuid REFERENCES users (id),
  toxicologico_resolvido_em timestamptz,

  -- O descarte MARCA, não apaga (princípio III). É o que torna o índice acima parcial.
  arquivado_em timestamptz,
  arquivado_por uuid REFERENCES users (id),
  arquivado_motivo text,

  conferido_por uuid REFERENCES users (id),
  conferido_em timestamptz,
  enviado_por uuid REFERENCES users (id),
  enviado_em timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Um pré-cadastro ABERTO por CPF. Ver o bloco sobre o índice parcial no topo.
CREATE UNIQUE INDEX driver_preregistrations_cpf_aberto_uq
  ON driver_preregistrations (cpf)
  WHERE arquivado_em IS NULL;

-- A fila é lida por ordem de chegada, filtrando os arquivados: é essa a consulta da tela.
CREATE INDEX driver_preregistrations_fila_idx
  ON driver_preregistrations (status, created_at)
  WHERE arquivado_em IS NULL;

CREATE TABLE driver_preregistration_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preregistration_id uuid NOT NULL REFERENCES driver_preregistrations (id),
  recebido_em timestamptz NOT NULL DEFAULT now(),

  /*
   * HASH da origem, NUNCA o IP.
   *
   * Para conter repetição basta saber que é A MESMA origem. Saber QUAL é dado pessoal que não
   * precisamos guardar — e que, guardado, vira responsabilidade sem contrapartida nenhuma.
   */
  origem_hash text,

  /*
   * O que chegou NESSE envio, exatamente como chegou.
   *
   * O normalizado vive no pré-cadastro; aqui fica o cru, para responder "o que ele mandou?" mesmo
   * depois de alguém corrigir na conferência.
   */
  dados jsonb NOT NULL,

  -- As fotos vivem na fatia 025 (bucket privado). Aqui só as chaves.
  documento_cnh_id uuid REFERENCES resource_documents (id),
  documento_comprovante_id uuid REFERENCES resource_documents (id)
);

CREATE INDEX driver_preregistration_submissions_prereg_idx
  ON driver_preregistration_submissions (preregistration_id, recebido_em DESC);

/*
 * AS FOTOS ENTRAM PELA FATIA 025, e para isso ela precisa aceitar um terceiro dono.
 *
 * `resource_documents` já resolve tudo o que as fotos do pré-cadastro precisam — bucket privado,
 * histórico, link de curta duração — e reconstruir isso dentro da 028 seria uma segunda via de
 * armazenamento de binário, com todas as chances de divergir da primeira.
 *
 * O que faltava: o CHECK só admitia 'driver' e 'vehicle'. O autor da 025 ANTECIPOU exatamente isto
 * ao escolher `text` com CHECK em vez de enum — "adicionar `trailer` depois é uma troca de CHECK de
 * uma linha, não cirurgia de enum". É essa troca.
 *
 * `preregistration` como dono é a verdade: a foto foi mandada PARA um pré-cadastro, por alguém que
 * ainda não é motorista. Pendurá-la num `drivers` inventado para caber no CHECK seria criar
 * cadastro de motorista a partir de formulário público — precisamente o que a fatia se recusa a
 * fazer.
 */
ALTER TABLE resource_documents DROP CONSTRAINT resource_documents_entity_type_ck;

ALTER TABLE resource_documents ADD CONSTRAINT resource_documents_entity_type_ck
  CHECK (entity_type IN ('driver', 'vehicle', 'preregistration'));
